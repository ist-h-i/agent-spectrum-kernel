#!/usr/bin/env node
import { chmodSync, existsSync, lstatSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const configPath = process.argv[2];
if (!configPath) throw new Error("barrier mutator config path is required");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const waitArray = new Int32Array(new SharedArrayBuffer(4));

function waitFor(file, label) {
  const deadline = Date.now() + 10_000;
  while (!existsSync(file)) {
    if (Date.now() >= deadline) throw new Error(label + " timed out");
    Atomics.wait(waitArray, 0, 0, 5);
  }
}

function marker(suffix, value) {
  writeFileSync(config.prefix + suffix, value, { flag: "wx" });
}

waitFor(config.prefix + ".ready", "ready barrier");
const target = config.target;
const originalMode = lstatSync(target).mode & 0o777;
const originalInode = lstatSync(target).ino;
const parent = dirname(target);
const parentMode = lstatSync(parent).mode & 0o777;
let backup = null;
let observedMode = originalMode;
let replacementInode = originalInode;

if (config.operation === "chmod") {
  chmodSync(target, originalMode | 0o200);
  observedMode = lstatSync(target).mode & 0o777;
} else {
  backup = target + ".ask-race-backup-" + process.pid;
  chmodSync(parent, parentMode | 0o200);
  renameSync(target, backup);
  writeFileSync(target, Buffer.from(config.replacement_base64, "base64"));
  chmodSync(target, originalMode);
  replacementInode = lstatSync(target).ino;
  chmodSync(parent, parentMode);
}

marker(".mutation.json", JSON.stringify({
  original_mode: originalMode,
  observed_mode: observedMode,
  original_inode: originalInode,
  replacement_inode: replacementInode,
}) + "\n");
marker(".continue", "continue\n");
waitFor(config.prefix + ".observed", "observed barrier");

if (config.operation === "chmod") {
  chmodSync(target, originalMode);
} else {
  chmodSync(parent, parentMode | 0o200);
  rmSync(target);
  renameSync(backup, target);
  chmodSync(target, originalMode);
  chmodSync(parent, parentMode);
}

marker(".restored", "restored\n");
