// Closed operation labels only: never argv, stderr, environment or credentials.
export function preparationGitOperation(args) {
  const command = args.find(value => ["rev-parse", "ls-tree", "cat-file", "init", "config", "add", "commit", "status"].includes(value));
  if (command === "rev-parse") return `rev-parse:${args.includes("--show-toplevel") ? "root" : args.includes("--verify") ? "verify-commit" : "head"}`;
  if (command === "config") {
    const key = args.find(value => ["core.hooksPath", "core.autocrlf", "core.filemode", "core.fsmonitor", "maintenance.auto", "gc.auto"].includes(value));
    return `config:${key ?? "other"}`;
  }
  if (command === "cat-file") {
    const object = args.at(-1);
    return `cat-file:blob${/^[a-f0-9]{40}$/u.test(object) ? `:object=${object}` : ""}`;
  }
  return command ?? "other";
}
