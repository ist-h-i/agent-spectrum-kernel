import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  copyFileSync,
  existsSync,
  fstatSync,
  ftruncateSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, resolve } from "node:path";

export function assertFlatRegularAuthorityDirectory(directory, label) {
  if (!directory || !existsSync(directory) || lstatSync(directory).isSymbolicLink() || !lstatSync(directory).isDirectory()) {
    throw new Error(`${label} must be an existing non-symlink directory`);
  }
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    const metadata = lstatSync(absolute);
    if (entry.isSymbolicLink() || metadata.isSymbolicLink() || !entry.isFile() || !metadata.isFile()) {
      throw new Error(`${label} contains a symlink or non-regular entry: ${entry.name}`);
    }
  }
}

export function writeAuthorityJsonNoFollow(path, value, label = "authority JSON") {
  if (existsSync(path)) {
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error(`${label} target is a symlink or non-regular entry`);
  }
  const descriptor = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o644);
  try {
    if (!fstatSync(descriptor).isFile()) throw new Error(`${label} target is not a regular file`);
    ftruncateSync(descriptor, 0);
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`);
  } finally {
    closeSync(descriptor);
  }
}

export function prepareAuthorityPublication(pairs) {
  const transactionDirectories = new Set();
  const prepared = [];
  try {
    for (const { source, target, transactionDirectory, label } of pairs) {
      if (!existsSync(source) || !lstatSync(source).isFile() || lstatSync(source).isSymbolicLink()) throw new Error(`${label} staged source is invalid`);
      if (existsSync(target) && (!lstatSync(target).isFile() || lstatSync(target).isSymbolicLink())) throw new Error(`${label} target is invalid`);
      if (existsSync(target) && readFileSync(source).equals(readFileSync(target))) continue;
      if (!existsSync(transactionDirectory)) mkdirSync(transactionDirectory, { recursive: false });
      transactionDirectories.add(transactionDirectory);
      const suffix = randomUUID();
      const staged = resolve(transactionDirectory, `${basename(target)}.${suffix}.staging`);
      const backup = resolve(transactionDirectory, `${basename(target)}.${suffix}.backup`);
      copyFileSync(source, staged, constants.COPYFILE_EXCL);
      const hadTarget = existsSync(target);
      if (hadTarget) copyFileSync(target, backup, constants.COPYFILE_EXCL);
      prepared.push({ target, staged, backup, label, published: false, hadTarget });
    }
    return { prepared, transactionDirectories: [...transactionDirectories] };
  } catch (error) {
    for (const record of prepared) {
      rmSync(record.staged, { force: true });
      rmSync(record.backup, { force: true });
    }
    for (const directory of transactionDirectories) rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

function rollbackPreparedAuthority(preparedState, publicationError) {
  const rollbackErrors = [];
  for (const record of [...preparedState.prepared].reverse()) {
    try {
      if (record.published) {
        if (record.hadTarget) {
          if (!existsSync(record.backup)) throw new Error(`${record.label} rollback backup is missing`);
          renameSync(record.backup, record.target);
        } else {
          rmSync(record.target, { force: true });
        }
      }
      rmSync(record.staged, { force: true });
      rmSync(record.backup, { force: true });
    } catch (error) {
      rollbackErrors.push(error);
    }
  }
  for (const directory of preparedState.transactionDirectories) {
    try { rmSync(directory, { recursive: true, force: true }); }
    catch (error) { rollbackErrors.push(error); }
  }
  if (rollbackErrors.length > 0) throw new AggregateError([publicationError, ...rollbackErrors], "authority publication and rollback failed");
  throw publicationError;
}

export function publishPreparedAuthority(preparedState, validatePublished, {
  publishEntry = (source, target) => renameSync(source, target),
  removeBackup = (path) => rmSync(path, { force: true }),
  removeTransactionDirectory = (path) => rmSync(path, { recursive: true, force: true }),
} = {}) {
  let result;
  try {
    for (const record of preparedState.prepared) {
      publishEntry(record.staged, record.target);
      record.published = true;
    }
    result = validatePublished();
  } catch (error) {
    return rollbackPreparedAuthority(preparedState, error);
  }

  // Publication is committed after validation. Cleanup failures must never
  // re-enter rollback after one or more backups have been destroyed.
  for (const record of preparedState.prepared) removeBackup(record.backup);
  for (const directory of preparedState.transactionDirectories) removeTransactionDirectory(directory);
  return result;
}
