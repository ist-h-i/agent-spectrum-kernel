export class JsonParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JsonParseError';
  }
}

export function parseJsonDocument(content: string, label: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch (error) {
    throw new JsonParseError(`${label} could not be parsed as JSON: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

export function stringifyJsonDocument(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
