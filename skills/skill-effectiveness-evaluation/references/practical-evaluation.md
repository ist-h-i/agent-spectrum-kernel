# Run a practical Eval

This reference travels with the selected Skill on both adapters. The execution
CLI is supplied by the complete ASK runtime checkout, as are the existing
environment and personal-loop CLIs. Resolve that configured runtime location
first; do not assume the adopting project's `scripts/` contains ASK executables.
A consumer uses a pinned official ASK runtime and does not fork ASK or maintain
an ASK development branch. If its source/runtime has been removed, report the
missing capability and restore/configure the runtime before dispatch.

1. Read `docs/practical-evaluation-recovery.md` in that runtime. Choose useful
   public project tasks, success criteria, condition context and a bounded retry
   budget. The caller's own checks, rubric or AI grader are allowed; ASK private
   grading assets are not required. Preserve unknown quality when it is ungraded.
2. Run `node <ASK_RUNTIME>/scripts/practical-evaluation-cli.mjs advance --root RUN
   --config CONFIG`. Present the exact case packet to the human. Supply only the
   actual human approval with `--decision approved --packet DIGEST --reason TEXT`.
3. At `awaiting_ai_recovery`, the AI reads `pending_recovery` and chooses use,
   reference, exclusion, one-trial retry or all-condition case retry. Submit the
   structured JSON with `--assessment FILE`. This routine judgment belongs to
   the AI; do not ask the user to repair the run manually. A configured `assess`
   worker automates the same port.
4. Keep every original and replacement outcome, reasoning, context, comparison
   limit and selected attempt. Use useful incomplete measurements. Do not rerun
   just to improve scores, erase failures, fill missing counters with zero, or
   relaunch a consumed command whose process state is uncertain.
5. Review the report against the real-work goal, including failed/retry costs,
   assessment overhead and uncertainty. Bring it to the existing human
   application decision. No report or recovery judgment installs assets.

For a Full self-improvement profile, select
`full_practical_instruction_loop_profile_v1` with
`policy.evaluation_mode: practical_v1` in the same configured ASK runtime. It
uses the existing generation/Registry/owner lifecycle and the public practical
Eval. The parent's exact case approval is verified and reused by the inner
runner. Submit routine AI judgments through the normal supervised CLI's
`--assessment` option; it returns to the existing result/change gate afterward.
See the runtime's `docs/practical-evaluation-recovery.md` for the profile fields.

Frozen historical primary batches keep their original single-shot policy. New
attempts and a new practical ledger do not rewrite old source, scores or records.
