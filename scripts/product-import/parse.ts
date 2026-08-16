import { extname } from "node:path";
import { parseCsv } from "./sources/csv";
import { parseJson } from "./sources/json";

export type RawProductRecord = {
  rowNumber: number;
  values: Record<string, unknown>;
};

const supportedFields = new Set([
  "brand_slug",
  "product_name",
  "product_slug",
  "category_slug",
  "description",
  "tags",
  "seasonal",
  "availability",
  "location_slugs",
  "source_provider",
  "source_url",
  "source_external_id",
  "source"
]);

const unsupportedPriceFields = new Set([
  "price",
  "price_cents",
  "currency",
  "location_price",
  "location_price_cents"
]);

function validateFields(
  values: Record<string, unknown>,
  rowNumber: number
): void {
  for (const field of Object.keys(values)) {
    if (unsupportedPriceFields.has(field)) {
      throw new Error(
        `row ${rowNumber}: unsupported price field "${field}"; WM-48 does not import prices`
      );
    }
    if (!supportedFields.has(field)) {
      throw new Error(`row ${rowNumber}: unsupported field "${field}"`);
    }
  }
}

export function parseProductFile(
  input: string,
  fileName: string
): RawProductRecord[] {
  const extension = extname(fileName).toLowerCase();
  const records =
    extension === ".csv"
      ? parseCsv(input)
      : extension === ".json"
        ? parseJson(input)
        : (() => {
            throw new Error("Import file must use .csv or .json extension");
          })();

  if (records.length === 0) {
    throw new Error("Import file must contain at least one product row");
  }

  return records.map((values, index) => {
    const rowNumber = index + 2;
    validateFields(values, rowNumber);
    return { rowNumber, values };
  });
}
