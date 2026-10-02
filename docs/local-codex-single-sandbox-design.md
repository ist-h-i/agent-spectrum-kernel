# Non-nested model-free admission design (Issue #315)

Status: design only; no native CLI/probe, VM, network setting or OS permission
operation performed. The current executable native route is disabled. Runtime
storage separation fixes the evidence/runtime collision in owned fake tests;
it does not prove a fix for sandbox_apply EPERM.

## Facts and uncertainty

On head46a815c Phase A, metadata checks passed and the canary failed exit71 with
`sandbox-exec: sandbox_apply: Operation not permitted`. Saved launches and source
show outer Seatbelt -> Node guarded worker -> Codex sandbox -> inner Seatbelt.
[Pinned Codex debug sandbox source](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/cli/src/debug_sandbox.rs)
spawns `/usr/bin/sandbox-exec` for the managed Mac profile. The launch is nested;
the precise kernel/policy refusal is unknown. No extra allow rule is justified
by that observation alone. Moving HOME does not change this topology.

[Pinned CLI startup](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/arg0/src/lib.rs)
creates HOME-scoped helper aliases and can run configuration loading before the
model-tool sandbox. Its filesystem/network effects cannot be constrained by
the model-tool profile alone. Simply removing the outer guard would lose the
approved model-free external-network restriction.

## Candidate that avoids nesting

Use an isolated disposable guest with no external network device and no host
directories, credentials, socket transports or clipboard sharing. Place only
the pinned trusted CLI/Node/controller and declared public task into the guest;
keep actual grading materials and existing host credentials outside it. Guest
synthetic negative canaries reproduce the grading/auth/other-trial/unrelated
file denial controls without copying their real counterparts.

Within the guest, run the trusted CLI/worker without an outer Seatbelt. Codex
applies the existing closed filesystem/network model-tool policy **once** to
the canary child. Guest loopback listeners provide IPv4/IPv6 positive controls;
absence of external guest connectivity independently restricts the trusted CLI
as well. Dedicated runtime and evidence directories remain separated and
source-bound. Export only regular selected evidence after guest shutdown,
without following runtime links. No retries or network-enabling fallback.

Apple's [macOS guest sample](https://developer.apple.com/documentation/virtualization/running-macos-in-a-virtual-machine-on-apple-silicon)
and [VM network-device configuration](https://developer.apple.com/documentation/virtualization/vzvirtualmachineconfiguration/networkdevices)
are the starting points for an Apple-silicon Mac guest. This is a candidate,
not a tested configuration or a Mac x64 solution. Docker is not required by the
distribution; a guest-based validation option must remain explicit and optional.
Linux namespaces could provide a lighter separate network boundary, but an
availability/privilege check and independent enforcement proof are still missing.

## Preconditions before any real execution proposal

- Choose and document the guest/network boundary and required host setup;
  prove no external interface, sharing/transport, proxy or hidden fallback.
- Pin guest OS/CPU, CLI/Node/images and controller source; ensure recorded host
  identity refers to the guest actually exercised. A guest smoke check does not
  verify the user's physical native host or another CPU/OS route.
- Implement a non-nested runner; independent review must verify its reachable
  process tree has one model-tool sandbox and no hidden parent Seatbelt.
- Add model-free positive/negative external-network controls, bounded process
  cleanup and regular evidence export. Review the retained closed read policy,
  synthetic grading/auth/other-trial controls and runtime-helper exception.
- Obtain separately authorized setup and probe execution, without reusing any
  consumed grant. No real run is proposed by this source correction.

The unchanged existing-store authentication/index0644 blocker concerns later
evaluation. A disconnected admission guest is not an authenticated evaluation
route; enabling vendor network access or transferring credentials requires a
separate design and authorization. Planned Mac/Linux/WSL support remains planned,
fake checks remain synthetic, and no new real-OS support is claimed.
