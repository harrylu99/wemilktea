export type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseJson(input: string): JsonRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error("JSON file is not valid JSON");
  }

  if (!Array.isArray(parsed) || parsed.some((row) => !isRecord(row))) {
    throw new Error("JSON import must be an array of objects");
  }

  return parsed as JsonRecord[];
}
