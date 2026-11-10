import { parse, stringify } from 'yaml';

export class YamlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'YamlParseError';
  }
}

export function parseYamlDocument(content: string, label: string): unknown {
  try {
    return parse(content) as unknown;
  } catch (error) {
    throw new YamlParseError(`${label} could not be parsed as YAML: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

export function stringifyYamlDocument(value: unknown): string {
  return stringify(value);
}
