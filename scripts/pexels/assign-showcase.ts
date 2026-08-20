import { assignmentEnvironmentSchema, parseEnvironment } from "./config";
import { createShowcaseRepository, createSupabaseClient } from "./repository";
import type { ShowcasePoolImage } from "./types";

type CliOptions = { apply: boolean; help: boolean };

function printHelp() {
  console.log(`Usage:
  bun --env-file=.env.local scripts/pexels/assign-showcase.ts
  bun --env-file=.env.local scripts/pexels/assign-showcase.ts --apply

Default mode is dry run. --apply assigns one active category image only to
Products that do not already have a primary image.
`);
}

function parseArgs(argv: string[]): CliOptions {
  const options = { apply: false, help: false };
  for (const argument of argv) {
    if (argument === "--apply") options.apply = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown option "${argument}"`);
  }
  return options;
}

export function chooseImage(
  images: ShowcasePoolImage[],
  usage: Map<string, number>,
  random: () => number = Math.random
) {
  if (images.length === 0) return null;
  const minimumUse = Math.min(
    ...images.map((image) => usage.get(image.imageId) ?? 0)
  );
  const candidates = images.filter(
    (image) => (usage.get(image.imageId) ?? 0) === minimumUse
  );
  const index = Math.min(
    candidates.length - 1,
    Math.floor(random() * candidates.length)
  );
  return candidates[index] ?? null;
}

async function run(options: CliOptions) {
  if (options.help) {
    printHelp();
    return;
  }
  const environment = parseEnvironment(assignmentEnvironmentSchema);
  const repository = createShowcaseRepository(
    createSupabaseClient({
      supabaseUrl: environment.SUPABASE_URL,
      serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY
    })
  );
  const [products, pool] = await Promise.all([
    repository.loadAssignableProducts(),
    repository.loadActivePoolImages()
  ]);
  const usage = new Map<string, number>();
  let assigned = 0;
  let skippedNoPool = 0;

  for (const product of products) {
    const candidates = pool.filter(
      (image) => image.categoryId === product.categoryId
    );
    const image = chooseImage(candidates, usage);
    if (!image) {
      skippedNoPool += 1;
      console.log(
        `SKIP ${product.name} (${product.categorySlug}): no active showcase image`
      );
      continue;
    }
    console.log(
      `${options.apply ? "ASSIGN" : "WOULD ASSIGN"} ${product.name} (${product.categorySlug})`
    );
    if (!options.apply) continue;

    const result = await repository.assignShowcaseImage(
      product.id,
      image.imageId
    );
    if (result.assigned) {
      assigned += 1;
      usage.set(image.imageId, (usage.get(image.imageId) ?? 0) + 1);
    }
  }

  console.log(`Products without primary image: ${products.length}`);
  console.log(`Assigned: ${assigned}`);
  console.log(`Skipped without pool image: ${skippedNoPool}`);
  if (!options.apply)
    console.log("Dry run complete. No database changes were made.");
}

if (import.meta.main) {
  try {
    await run(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(
      error instanceof Error
        ? `Showcase assignment failed: ${error.message}`
        : "Showcase assignment failed."
    );
    process.exitCode = 1;
  }
}
