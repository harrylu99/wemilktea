import { assignmentEnvironmentSchema, parseEnvironment } from "./config";
import { createShowcaseRepository, createSupabaseClient } from "./repository";
import type { StoreShowcasePoolImage } from "./types";

type CliOptions = { apply: boolean; help: boolean };

function printHelp() {
  console.log(`Usage:
  bun --env-file=.env.local scripts/pexels/assign-store-showcase.ts
  bun --env-file=.env.local scripts/pexels/assign-store-showcase.ts --apply

Default mode is dry run. --apply assigns an active Store showcase image only
to locations that do not already have a primary image.
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

export function chooseStoreImage(
  images: StoreShowcasePoolImage[],
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
  if (options.help) return printHelp();
  const environment = parseEnvironment(assignmentEnvironmentSchema);
  const repository = createShowcaseRepository(
    createSupabaseClient({
      supabaseUrl: environment.SUPABASE_URL,
      serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY
    })
  );
  const [locations, pool, usage] = await Promise.all([
    repository.loadAssignableLocations(),
    repository.loadActiveStorePoolImages(),
    repository.loadStoreShowcaseImageUsage()
  ]);
  let assigned = 0;
  let skippedNoPool = 0;

  for (const location of locations) {
    const image = chooseStoreImage(pool, usage);
    if (!image) {
      skippedNoPool += 1;
      console.log(
        `SKIP ${location.displayName} (${location.slug}): no active Store showcase image`
      );
      continue;
    }
    console.log(
      `${options.apply ? "ASSIGN" : "WOULD ASSIGN"} ${location.displayName} (${location.slug})`
    );
    if (!options.apply) continue;
    const result = await repository.assignShowcaseImageToLocation(
      location.id,
      image.imageId
    );
    if (result.assigned) {
      assigned += 1;
      usage.set(image.imageId, (usage.get(image.imageId) ?? 0) + 1);
    }
  }

  console.log(`Locations without primary image: ${locations.length}`);
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
        ? `Store showcase assignment failed: ${error.message}`
        : "Store showcase assignment failed."
    );
    process.exitCode = 1;
  }
}
