import { createPortal } from "./app.mjs";
const port = Number(process.env.PORT ?? 0);
if (!Number.isInteger(port) || port < 0 || port > 65535)
  throw new Error("PORT must be an integer from 0 to 65535");
const app = createPortal({
  stateDirectory: process.env.REVIEWOPS_STATE_DIR,
  providerDirectory: process.env.REVIEWOPS_PROVIDER_DIR,
});
console.log(`ReviewOps synthetic portal: ${await app.listen(port)}`);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
