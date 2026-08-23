import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, parse, relative, resolve, sep } from "node:path";

export const DEFAULT_CONTENT_ADDRESSED_OBJECT_MAX_BYTES = 1024 * 1024;
const DIGEST_PATTERN = /^sha256:([a-f0-9]{64})$/u;

function assertJsonValue(value, path = "$", ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new TypeError(`${path} contains a circular JSON value`);
    ancestors.add(value);
    value.forEach((entry, index) => assertJsonValue(entry, `${path}[${index}]`, ancestors));
    ancestors.delete(value);
    return;
  }
  if (typeof value === "object") {
    if (ancestors.has(value)) throw new TypeError(`${path} contains a circular JSON value`);
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${path} must contain plain JSON objects`);
    ancestors.add(value);
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined || typeof entry === "function" || typeof entry === "symbol" || typeof entry === "bigint") throw new TypeError(`${path}.${key} is not a JSON value`);
      assertJsonValue(entry, `${path}.${key}`, ancestors);
    }
    ancestors.delete(value);
    return;
  }
  throw new TypeError(`${path} is not a JSON value`);
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function stableCanonicalJson(value) {
  assertJsonValue(value);
  return canonicalize(value);
}

export function canonicalDigest(value) {
  return `sha256:${createHash("sha256").update(stableCanonicalJson(value)).digest("hex")}`;
}

function digestHex(digest, label = "content digest") {
  const match = DIGEST_PATTERN.exec(digest ?? "");
  if (!match) throw new Error(`${label} must be a sha256 digest`);
  return match[1];
}

function lstatIfPresent(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function canonicalTargetPath(path, label = "filesystem target") {
  const absolute = resolve(path);
  const leaf = lstatIfPresent(absolute);
  if (leaf?.isSymbolicLink()) throw new Error(`${label} must not be a symlink`);
  let existing = absolute;
  const missing = [];
  while (!existsSync(existing)) {
    missing.unshift(basename(existing));
    const parent = dirname(existing);
    if (parent === existing) throw new Error(`${label} has no existing filesystem ancestor`);
    existing = parent;
  }
  return resolve(realpathSync(existing), ...missing);
}

function statusIdentity(status) {
  return {
    dev: status.dev,
    ino: status.ino,
    mode: status.mode,
    size: status.size,
    mtimeMs: status.mtimeMs,
    ctimeMs: status.ctimeMs,
  };
}

function sameStatus(left, right) {
  return JSON.stringify(statusIdentity(left)) === JSON.stringify(statusIdentity(right));
}

export function assertNoSymlinkPathSegments(path, label, { allowMissingLeaf = false } = {}) {
  const absolute = resolve(path);
  const filesystemRoot = parse(absolute).root;
  const segments = relative(filesystemRoot, absolute).split(sep).filter(Boolean);
  let current = filesystemRoot;
  for (let index = 0; index < segments.length; index += 1) {
    current = resolve(current, segments[index]);
    const status = lstatIfPresent(current);
    if (!status) {
      if (allowMissingLeaf) return;
      throw new Error(`${label} does not exist`);
    }
    if (status.isSymbolicLink()) throw new Error(`${label} traverses a symlink`);
    if (index < segments.length - 1 && !status.isDirectory()) throw new Error(`${label} traverses a non-directory path`);
  }
}

function ensureDirectory(path, label) {
  const absolute = resolve(path);
  assertNoSymlinkPathSegments(absolute, label, { allowMissingLeaf: true });
  mkdirSync(absolute, { recursive: true, mode: 0o700 });
  assertNoSymlinkPathSegments(absolute, label);
  if (!lstatSync(absolute).isDirectory()) throw new Error(`${label} must be a directory`);
  return absolute;
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${stableCanonicalJson(value)}\n`, "utf8");
}

function readStableBytes(path, label, maximumBytes) {
  assertNoSymlinkPathSegments(path, label);
  const initial = lstatSync(path);
  if (!initial.isFile()) throw new Error(`${label} must be a regular file`);
  if (initial.size === 0 || initial.size > maximumBytes) throw new Error(`${label} must be a bounded non-empty file`);
  const descriptor = openSync(path, "r");
  try {
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || !sameStatus(initial, opened)) throw new Error(`${label} changed before read`);
    const bytes = readFileSync(descriptor);
    const completed = fstatSync(descriptor);
    if (!sameStatus(opened, completed) || bytes.length !== completed.size) throw new Error(`${label} changed during read`);
    const final = lstatSync(path);
    if (final.isSymbolicLink() || !final.isFile() || !sameStatus(completed, final)) throw new Error(`${label} changed after read`);
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

export class DuplicateJsonKeyError extends SyntaxError {
  constructor(label, key) {
    super(`${label} contains duplicate JSON object key: ${key}`);
    this.name = "DuplicateJsonKeyError";
    this.code = "DUPLICATE_JSON_OBJECT_KEY";
    this.key = key;
  }
}

export function parseJsonRejectDuplicateKeys(value, label = "JSON artifact") {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  let source;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new SyntaxError(`${label} is not valid UTF-8 JSON`);
  }
  let offset = 0;
  const invalid = () => { throw new SyntaxError(`${label} is invalid JSON`); };
  const whitespace = () => {
    while (offset < source.length && /[\u0009\u000a\u000d\u0020]/u.test(source[offset])) offset += 1;
  };
  const stringToken = () => {
    if (source[offset] !== '"') invalid();
    const start = offset;
    offset += 1;
    while (offset < source.length) {
      const character = source[offset];
      if (character === '"') {
        offset += 1;
        try {
          return JSON.parse(source.slice(start, offset));
        } catch {
          invalid();
        }
      }
      if (character === "\\") {
        offset += 1;
        const escaped = source[offset];
        if (escaped === "u") {
          if (!/^[a-fA-F0-9]{4}$/u.test(source.slice(offset + 1, offset + 5))) invalid();
          offset += 5;
        } else if ('"\\/bfnrt'.includes(escaped)) offset += 1;
        else invalid();
        continue;
      }
      if (character.charCodeAt(0) < 0x20) invalid();
      offset += 1;
    }
    invalid();
  };
  const valueToken = () => {
    whitespace();
    const character = source[offset];
    if (character === "{") {
      offset += 1;
      whitespace();
      const keys = new Set();
      if (source[offset] === "}") {
        offset += 1;
        return;
      }
      while (offset < source.length) {
        const key = stringToken();
        if (keys.has(key)) throw new DuplicateJsonKeyError(label, key);
        keys.add(key);
        whitespace();
        if (source[offset] !== ":") invalid();
        offset += 1;
        valueToken();
        whitespace();
        if (source[offset] === "}") {
          offset += 1;
          return;
        }
        if (source[offset] !== ",") invalid();
        offset += 1;
        whitespace();
      }
      invalid();
    }
    if (character === "[") {
      offset += 1;
      whitespace();
      if (source[offset] === "]") {
        offset += 1;
        return;
      }
      while (offset < source.length) {
        valueToken();
        whitespace();
        if (source[offset] === "]") {
          offset += 1;
          return;
        }
        if (source[offset] !== ",") invalid();
        offset += 1;
      }
      invalid();
    }
    if (character === '"') {
      stringToken();
      return;
    }
    for (const literal of ["true", "false", "null"]) {
      if (source.startsWith(literal, offset)) {
        offset += literal.length;
        return;
      }
    }
    const number = source.slice(offset).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u)?.[0];
    if (!number) invalid();
    offset += number.length;
  };
  valueToken();
  whitespace();
  if (offset !== source.length) invalid();
  return JSON.parse(source);
}

function publishBytesAtomicNoReplace(path, bytes, label) {
  const output = resolve(path);
  const parent = ensureDirectory(dirname(output), `${label} directory`);
  assertNoSymlinkPathSegments(parent, `${label} directory`);
  const existing = lstatIfPresent(output);
  if (existing) {
    if (existing.isSymbolicLink() || !existing.isFile()) throw new Error(`${label} existing output is not a regular file`);
    const actual = readStableBytes(output, label, Math.max(bytes.length, DEFAULT_CONTENT_ADDRESSED_OBJECT_MAX_BYTES));
    if (Buffer.compare(actual, bytes) !== 0) throw new Error(`${label} existing output conflicts with the content address`);
    return { created: false, path: output, bytes };
  }
  const staging = resolve(parent, `.${basename(output)}.staging-${randomUUID()}`);
  let descriptor;
  try {
    descriptor = openSync(staging, "wx", 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    try {
      linkSync(staging, output);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const actual = readStableBytes(output, label, Math.max(bytes.length, DEFAULT_CONTENT_ADDRESSED_OBJECT_MAX_BYTES));
      if (Buffer.compare(actual, bytes) !== 0) throw new Error(`${label} appeared with conflicting content`);
      return { created: false, path: output, bytes };
    }
    let directoryDescriptor;
    try {
      directoryDescriptor = openSync(parent, "r");
      fsyncSync(directoryDescriptor);
    } catch (error) {
      if (!["EINVAL", "ENOTSUP", "EISDIR", "EPERM", "EBADF"].includes(error?.code)) throw error;
    } finally {
      if (directoryDescriptor !== undefined) closeSync(directoryDescriptor);
    }
    return { created: true, path: output, bytes };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(staging)) unlinkSync(staging);
  }
}

export function contentAddressedObjectPath({ storeRoot, digest }) {
  const hex = digestHex(digest);
  return resolve(canonicalTargetPath(storeRoot, "content-addressed store root"), "objects", "sha256", hex.slice(0, 2), `${hex.slice(2)}.json`);
}

export function putContentAddressedJson({ storeRoot, artifact, digest = canonicalDigest(artifact), maximumBytes = DEFAULT_CONTENT_ADDRESSED_OBJECT_MAX_BYTES }) {
  if (canonicalDigest(artifact) !== digest) throw new Error("content-addressed artifact digest does not match its canonical content");
  const bytes = canonicalJsonBytes(artifact);
  if (bytes.length > maximumBytes) throw new Error("content-addressed artifact exceeds the byte limit");
  const path = contentAddressedObjectPath({ storeRoot, digest });
  const publication = publishBytesAtomicNoReplace(path, bytes, "content-addressed object");
  return { ...publication, digest };
}

export function readContentAddressedJson({ storeRoot, digest, maximumBytes = DEFAULT_CONTENT_ADDRESSED_OBJECT_MAX_BYTES }) {
  const path = contentAddressedObjectPath({ storeRoot, digest });
  const bytes = readStableBytes(path, "content-addressed object", maximumBytes);
  const value = parseJsonRejectDuplicateKeys(bytes, "content-addressed object");
  if (canonicalDigest(value) !== digest) throw new Error("content-addressed object digest mismatch; object may be tampered");
  if (Buffer.compare(bytes, canonicalJsonBytes(value)) !== 0) throw new Error("content-addressed object is not in canonical byte form");
  return { value, path, bytes, digest };
}

export function listContentAddressedJson({ storeRoot, maximumBytes = DEFAULT_CONTENT_ADDRESSED_OBJECT_MAX_BYTES }) {
  const root = resolve(canonicalTargetPath(storeRoot, "content-addressed store root"), "objects", "sha256");
  if (!existsSync(root)) return [];
  assertNoSymlinkPathSegments(root, "content-addressed object root");
  if (!statSync(root).isDirectory()) throw new Error("content-addressed object root must be a directory");
  const records = [];
  for (const prefixEntry of readdirSync(root, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    if (prefixEntry.isSymbolicLink() || !prefixEntry.isDirectory() || !/^[a-f0-9]{2}$/u.test(prefixEntry.name)) throw new Error("content-addressed store contains an invalid prefix entry");
    const prefixPath = resolve(root, prefixEntry.name);
    for (const objectEntry of readdirSync(prefixPath, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      if (objectEntry.isSymbolicLink() || !objectEntry.isFile() || !/^[a-f0-9]{62}\.json$/u.test(objectEntry.name)) throw new Error("content-addressed store contains an invalid object entry");
      const digest = `sha256:${prefixEntry.name}${objectEntry.name.slice(0, -5)}`;
      records.push(readContentAddressedJson({ storeRoot, digest, maximumBytes }));
    }
  }
  return records;
}

export function readJsonFileStrict(path, label = "JSON input", maximumBytes = DEFAULT_CONTENT_ADDRESSED_OBJECT_MAX_BYTES) {
  const bytes = readStableBytes(canonicalTargetPath(path, label), label, maximumBytes);
  return parseJsonRejectDuplicateKeys(bytes, label);
}

export function writeCanonicalJsonNoReplace({ outputPath, artifact, label = "JSON output", maximumBytes = DEFAULT_CONTENT_ADDRESSED_OBJECT_MAX_BYTES }) {
  const bytes = canonicalJsonBytes(artifact);
  if (bytes.length > maximumBytes) throw new Error(`${label} exceeds the byte limit`);
  return publishBytesAtomicNoReplace(canonicalTargetPath(outputPath, label), bytes, label);
}
