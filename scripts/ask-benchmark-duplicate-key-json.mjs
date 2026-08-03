import { readStableFile } from "./ask-benchmark-stable-file.mjs";

export class DuplicateJsonKeyError extends SyntaxError {
  constructor(label, key) {
    super(`${label} contains duplicate JSON object key: ${key}`);
    this.name = "DuplicateJsonKeyError";
    this.code = "DUPLICATE_JSON_OBJECT_KEY";
    this.key = key;
  }
}

function jsonBytes(value, label) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") return Buffer.from(value, "utf8");
  throw new TypeError(`${label} JSON source must be bytes or a string`);
}

export function parseJsonRejectDuplicateKeys(value, label = "JSON authority") {
  let source;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(jsonBytes(value, label));
  } catch (error) {
    if (error instanceof TypeError && error.message.startsWith(`${label} JSON source`)) throw error;
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
        offset += 2;
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
  try {
    return JSON.parse(source);
  } catch {
    invalid();
  }
}

export function readStableJsonFile(path, label, maxBytes, options = { allowEmpty: false }) {
  const source = readStableFile(path, label, maxBytes, options);
  return { ...source, value: parseJsonRejectDuplicateKeys(source.bytes, label) };
}
