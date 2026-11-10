# Synthetic Shared Console

Requires Node 24. This package uses only Node/browser built-ins and imports the existing core TypeScript directly through Node's type stripping. No installation is needed for this portal.

From the workspace root:

```
node packages/portal/server/index.mjs
node --test packages/portal/test/*.test.mjs
```

The server prints its random loopback URL. Use that URL in the browser; Ctrl-C stops the owned server. `PORT=0` is the default. Do not bind to a public interface. Data lives in synthetic memory and resets on restart. This is not production storage.

Default synthetic identity is alex, a maintainer of both alpha and beta. For API probes use `x-user-id: blair` (alpha reader) or `x-user-id: casey` (beta maintainer). These are fixture identities, not authentication credentials. Team IDs and review IDs are synthetic and review IDs are unique only within a team.

`server/API.md` documents routes. `createPortal()` exposes the synthetic store, provider and queue for a bounded probe; `.listen()` starts on loopback and `.close()` releases it. Probes must close servers and use only synthetic files. Constructor seams can model delayed responses and lost receipts. They do not prove a real database or cloud provider has the same timing.

The legacy TypeScript package suite still requires its original development dependencies. Do not install the extension or configure a real GitHub provider to complete this exercise. Root scripts named generate-vsix/smoke-vsix are legacy packaging references, not this task's run commands.
