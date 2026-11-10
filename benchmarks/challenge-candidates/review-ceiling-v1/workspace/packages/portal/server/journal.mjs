import {
  readFileSync,
  writeFileSync,
  renameSync,
  realpathSync,
  lstatSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, basename, sep } from "node:path";

// Single-process synthetic snapshots only. Rename prevents torn JSON on ordinary
// process exit; this is not a database, cross-process lock, or power-loss guarantee.
export class SyntheticJournal {
  constructor(directory, filename) {
    const root = realpathSync(tmpdir());
    const target = realpathSync(directory);
    if (
      !target.startsWith(root + sep) ||
      !basename(target).startsWith("reviewops-")
    ) {
      throw new Error(
        "Persistence requires a reviewops-* directory created under the OS temporary directory",
      );
    }
    this.path = resolve(target, filename);
    try {
      if (!lstatSync(this.path).isFile())
        throw new Error("Synthetic journal must be a regular file");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  read() {
    try {
      return JSON.parse(readFileSync(this.path, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return undefined;
      throw error;
    }
  }
  write(value) {
    const next = `${this.path}.${process.pid}.next`;
    writeFileSync(next, JSON.stringify(value), { mode: 0o600, flag: "wx" });
    renameSync(next, this.path);
  }
}
