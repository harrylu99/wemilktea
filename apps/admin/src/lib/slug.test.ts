import { expect, test } from "bun:test";
import { slugify } from "./slug";

test("creates a canonical lowercase slug from a display name", () => {
  expect(slugify("Wucha Ormiston")).toBe("wucha-ormiston");
  expect(slugify("  Téa & Co.  ")).toBe("tea-co");
});
