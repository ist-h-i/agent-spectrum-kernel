# Keep shipment search aligned with the dispatcher's latest query

A dispatch-desk operator can replace a shipment search while an earlier request is still pending, or leave the search view before it completes. The current controller can leave the supplied view showing the wrong request's state. Investigate and repair `src/search-controller.mjs` so the visible result, busy indicator and alert consistently belong to the current search.

Follow `spec/search-state-contract.md` and the fixed view adapter. Publish loading immediately, clear obsolete visible content, retain current result ordering, handle current failures with the specified safe message, and prevent stale completions from changing the current view. Preserve the transport's cancellation interface, isolated state snapshots and disposal behavior even when a transport ignores cancellation.

Change only `src/search-controller.mjs`; retain its public API and all fixed workspace files. Requests are deterministic local deferred promises with ordinary string-array data. No network, timers, dependencies or service setup are needed.

From the workspace, run `npm test`. Report the focused verification performed and any remaining gap.

## Required final validation (input integrity and public checks)

Run each command below from this workspace. Each first checks the fixed input files, then runs the required public checks. Report the actual results.

```bash
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),expected={"package.json":"a1334e7d677ec2df23b95a284b1a7179c07280762028c38fcb43ca16bfe5b943","spec/search-state-contract.md":"a4e981c2a5200f5ef4bcdaffc58a43a00fd697bbd311ebf07ddd5538ac53420c","src/search-view.mjs":"2d76ec1961c6888e9c321d8f47df7e54a8aed317fd9524ba3180b74d9664ea68","test/search-state.test.mjs":"1474fb9f6f54e7de19e96eed04491859f7f84fd656369d2fdba52c45adc7df17"};for(const [path,digest] of Object.entries(expected)){if(crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")!==digest)process.exit(41)}' && [ -f test/search-state.test.mjs ] && npm test
```
