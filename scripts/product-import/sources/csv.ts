export type CsvRecord = Record<string, string>;

function parseCsvRecords(input: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  const pushField = () => {
    record.push(field);
    field = "";
  };
  const pushRecord = () => {
    if (record.some((value) => value.trim() !== "")) {
      records.push(record);
    }
    record = [];
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      pushField();
    } else if (character === "\n") {
      pushField();
      pushRecord();
    } else if (character !== "\r") {
      field += character;
    }
  }

  if (quoted) {
    throw new Error("CSV contains an unterminated quoted field");
  }

  pushField();
  pushRecord();
  return records;
}

export function parseCsv(input: string): CsvRecord[] {
  const records = parseCsvRecords(input);
  const headers = records.shift();

  if (!headers || headers.length === 0) {
    throw new Error("CSV must contain a header row and at least one data row");
  }

  const normalizedHeaders = headers.map((header) => header.trim());
  if (
    normalizedHeaders.some((header) => !header) ||
    new Set(normalizedHeaders).size !== normalizedHeaders.length
  ) {
    throw new Error("CSV headers must be non-empty and unique");
  }

  return records.map((values, index) => {
    if (values.length !== normalizedHeaders.length) {
      throw new Error(
        `CSV row ${index + 2} has ${values.length} fields; expected ${normalizedHeaders.length}`
      );
    }

    return Object.fromEntries(
      normalizedHeaders.map((header, valueIndex) => [
        header,
        values[valueIndex].trim()
      ])
    );
  });
}
