import { z } from "zod";
import { applyImport, planImport } from "./importer";
import { parseProductFile } from "./parse";
import {
  createSupabaseClient,
  createSupabaseProductImportRepository
} from "./repository";
import type { ImportPlan, ImportPlanRow } from "./types";
import { normalizeProductImports } from "./validate";

const environmentSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1)
});

type CliOptions = {
  file: string | null;
  apply: boolean;
  help: boolean;
};

function printHelp() {
  console.log(`Usage:
  bun scripts/product-import/import-products.ts --file <path>
  bun scripts/product-import/import-products.ts --file <path> --dry-run
  bun scripts/product-import/import-products.ts --file <path> --apply

Default mode is dry run. Apply requires the explicit --apply flag and local
SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY environment variables.

Supported files are CSV and JSON. Price fields are rejected and never imported.
`);
}

function parseArgs(argv: string[]): CliOptions {
  let file: string | null = null;
  let apply = false;
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      return { file, apply, help: true };
    }
    if (argument === "--file") {
      file = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (argument === "--apply") {
      apply = true;
      continue;
    }
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    throw new Error(`Unknown option "${argument}"`);
  }

  if (apply && dryRun) {
    throw new Error("--apply and --dry-run cannot be used together");
  }
  if (!file) {
    throw new Error("--file <path> is required");
  }

  return { file, apply, help: false };
}

function printPlan(file: string, mode: "DRY RUN" | "APPLY", plan: ImportPlan) {
  console.log("Import plan");
  console.log("-----------");
  console.log(`File: ${file}`);
  console.log(`Mode: ${mode}`);
  console.log("");

  for (const issue of plan.issues) {
    console.log(`ERROR row ${issue.rowNumber}`);
    console.log(`  reason: ${issue.message}`);
  }
  for (const row of plan.rows) {
    printPlanRow(row);
  }

  console.log("Summary:");
  console.log(`  Rows: ${plan.rows.length + plan.issues.length}`);
  console.log(`  Create: ${plan.counts.create}`);
  console.log(`  Update: ${plan.counts.update}`);
  console.log(`  Skip: ${plan.counts.skip}`);
  console.log(`  Error: ${plan.counts.error}`);
  console.log(`  Location links: ${plan.counts.locationLinks}`);
}

function printPlanRow(row: ImportPlanRow) {
  const label = row.action.toUpperCase();
  const brand = row.brand?.slug ?? row.input.brandSlug;
  console.log(`${label} row ${row.rowNumber} [${brand}] ${row.input.name}`);
  if (row.action === "error") {
    for (const issue of row.issues) {
      console.log(`  reason: ${issue.message}`);
    }
    return;
  }
  if (row.locations.length > 0) {
    console.log(
      `  locations: ${row.locations.map((location) => location.slug).join(", ")}`
    );
  }
}

async function run(options: CliOptions): Promise<number> {
  if (options.help) {
    printHelp();
    return 0;
  }
  if (!options.file) {
    throw new Error("--file <path> is required");
  }

  const content = await Bun.file(options.file).text();
  const records = parseProductFile(content, options.file);
  const normalized = normalizeProductImports(records);
  const environment = environmentSchema.safeParse(process.env);
  if (!environment.success) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for reference resolution"
    );
  }

  const repository = createSupabaseProductImportRepository(
    createSupabaseClient({
      supabaseUrl: environment.data.SUPABASE_URL,
      serviceRoleKey: environment.data.SUPABASE_SERVICE_ROLE_KEY
    })
  );
  const snapshot = await repository.loadSnapshot();
  const plan = planImport(normalized.rows, snapshot, normalized.issues);
  printPlan(options.file, options.apply ? "APPLY" : "DRY RUN", plan);

  if (!options.apply) {
    console.log("");
    console.log("No database changes were made.");
    return plan.counts.error === 0 ? 0 : 1;
  }

  if (plan.counts.error > 0) {
    console.log("");
    console.log("Apply aborted: validation errors must be fixed first.");
    return 1;
  }

  const result = await applyImport(plan, repository);
  console.log("");
  console.log("Import complete");
  console.log("---------------");
  console.log(`Created products: ${result.createdProducts}`);
  console.log(`Updated products: ${result.updatedProducts}`);
  console.log(`Skipped products: ${result.skippedProducts}`);
  console.log(
    `Location relationships created: ${result.locationRelationshipsCreated}`
  );
  console.log("All newly created products remain draft.");
  return 0;
}

if (import.meta.main) {
  try {
    process.exitCode = await run(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(
      error instanceof Error
        ? `Import failed: ${error.message}`
        : "Import failed"
    );
    process.exitCode = 1;
  }
}
