// Read-only diagnostic module; excluded from the historical evaluator closure.
import { createHash } from "node:crypto";
import { CommandEvidenceError, MAX_COMMAND_EVENT_LINE_BYTES, renderCommandEvent } from "./ask-benchmark-command-evidence.mjs";
import { stableCanonicalJson } from "./ask-benchmark-materialize.mjs";

const SAVED_SHELL_PREFIXES = ["/bin/bash -lc ", "/bin/zsh -lc ", "/bin/bash -c "];
function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

// Keep this bounded data decoder local so diagnostics cannot modify frozen
// parser bytes or their acceptance rules. Shell text is never executed.
// Decode one literal shell word as data. No expansions, evaluation or execution.
function decodeLiteralShellWord(value) {
  let output = "", quote = null, sawQuote = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "\0") throw new CommandEvidenceError("malformed_shell_envelope", "runtime shell word contains a prohibited character");
    if (quote === "'") {
      if (character === "'") quote = null; else output += character;
      continue;
    }
    if (character === "\\") {
      const next = value[++index];
      if (next === undefined) throw new CommandEvidenceError("malformed_shell_envelope", "runtime shell word has incomplete escaping");
      if (next === "\0") throw new CommandEvidenceError("malformed_shell_envelope", "runtime shell word contains a prohibited character");
      if (next === "\n") continue;
      if (quote === '"' && !['$', String.fromCharCode(96), '"', '\\'].includes(next)) output += "\\";
      output += next;
      continue;
    }
    if (quote === '"') {
      if (character === '"') quote = null;
      else if (character === "$" || character === String.fromCharCode(96)) throw new CommandEvidenceError("ambiguous_shell_word", "runtime shell word requires expansion");
      else output += character;
      continue;
    }
    if (character === "'" || character === '"') { quote = character; sawQuote = true; continue; }
    if (!/[A-Za-z0-9_./:@%+=,-]/u.test(character)) throw new CommandEvidenceError("ambiguous_shell_word", "runtime shell envelope is not one literal word");
    output += character;
  }
  if (quote !== null || !sawQuote || output.length === 0) throw new CommandEvidenceError("malformed_shell_envelope", "runtime shell word has malformed quoting");
  return output;
}

// Diagnostic comparison only: this never grants matched evidence, reconstructs
// cwd/actor, or changes either historical parser revision or wire authority.
export function diagnoseSavedCommandBody({ rawCommand, contract }) {
  const base = { kind: "ask.saved-command-body-observation@1", scoring_eligible: false,
    unverified_context: ["working_directory", "execution_actor", "source_loaded", "outcome"] };
  const unknown = reason => ({ ...base, state: "unknown", reason, commands: [] });
  if (typeof rawCommand !== "string" || !rawCommand.length) return unknown("unsafe_command");
  if (Buffer.byteLength(rawCommand) > MAX_COMMAND_EVENT_LINE_BYTES) return unknown("line_oversized");
  if (!Array.isArray(contract?.commands) || !contract.commands.length) return unknown("command_contract_unavailable");
  try {
    let script = rawCommand;
    const wrappers = [];
    for (;;) {
      const prefix = SAVED_SHELL_PREFIXES.find(value => script.startsWith(value));
      if (!prefix) {
        if (!wrappers.length || /^\/bin\/[a-z]+\s/u.test(script)) return unknown("unsupported_shell");
        break;
      }
      if (wrappers.length === 2) return unknown("nested_shell_limit");
      const [executable, flag] = prefix.trim().split(" ");
      wrappers.push({ executable, arguments: [flag] });
      script = decodeLiteralShellWord(script.slice(prefix.length));
    }
    const commands = contract.commands.filter(command => command.execution_form === "codex_shell_command").map(command => {
      // renderCommandEvent checks the supported declared envelope. The output
      // describes byte relationships to caller-supplied public declarations;
      // even a valid declaration does not authenticate this runtime string.
      const rendered = renderCommandEvent(command);
      return { command_id: command.command_id, body_bytes_equal: script === command.canonical_script,
        canonical_render_bytes_equal: rawCommand === rendered,
        shell_envelope_equal: wrappers.length === 1 && stableCanonicalJson(wrappers[0]) === stableCanonicalJson(command.shell_envelope) };
    });
    return { ...base, state: "compared", raw_render_digest: sha256(Buffer.from(rawCommand)),
      body_digest: sha256(Buffer.from(script)), wrappers, commands };
  } catch (error) {
    return unknown(error instanceof CommandEvidenceError && ["malformed_shell_envelope", "ambiguous_shell_word"].includes(error.code) ? error.code : "unclassified");
  }
}

