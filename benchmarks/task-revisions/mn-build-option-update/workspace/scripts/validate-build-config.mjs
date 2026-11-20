import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync(new URL("../build.config.json", import.meta.url), "utf8"));
const { debug, release } = config.profiles ?? {};

if (!debug || !release) throw new Error("debug and release profiles are required");
if (release.target !== "node20" || release.minify !== true) throw new Error("release target and optimization settings changed");
if (!release.sourceMap || typeof release.sourceMap !== "object" || Array.isArray(release.sourceMap)) throw new Error("release sourceMap must use structured options");
if (release.sourceMap.scripts !== "hidden" || release.sourceMap.styles !== false) throw new Error("release sourceMap does not match the documented server-build contract");

console.log("Build configuration is valid.");
