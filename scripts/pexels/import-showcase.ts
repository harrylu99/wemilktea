import { operatorEnvironmentSchema, parseEnvironment } from "./config";
import { discoverShowcaseManifest } from "./pexels-api";
import { createShowcaseRepository, createSupabaseClient } from "./repository";
import {
  buildShowcaseStorageKey,
  contentTypeFromResponse,
  createR2ObjectStorage,
  isShowcaseStorageKey,
  maxImageBytes
} from "./storage";
import {
  showcaseCategoryConfigs,
  showcaseManifestSchema,
  type ShowcaseManifest,
  type ShowcaseManifestEntry
} from "./types";

type CliOptions = {
  discover: boolean;
  apply: boolean;
  dryRun: boolean;
  manifest: string | null;
  output: string | null;
  help: boolean;
};

function printHelp() {
  console.log(`Usage:
  bun --env-file=.env.local scripts/pexels/import-showcase.ts --discover [--output <path>]
  bun --env-file=.env.local scripts/pexels/import-showcase.ts --manifest <path> --dry-run
  bun --env-file=.env.local scripts/pexels/import-showcase.ts --apply --manifest <path>

Discover never writes to R2 or Supabase. Apply imports only entries whose
approved field is true. Use --dry-run to validate an approved manifest without
writing. PEXELS_API_KEY and privileged R2/Supabase variables are server-only.
`);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    discover: false,
    apply: false,
    dryRun: false,
    manifest: null,
    output: null,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (argument === "--discover") {
      options.discover = true;
      continue;
    }
    if (argument === "--apply") {
      options.apply = true;
      continue;
    }
    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (argument === "--manifest" || argument === "--output") {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a path`);
      options[argument === "--manifest" ? "manifest" : "output"] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown option "${argument}"`);
  }

  if (options.help) return options;
  if (
    options.discover &&
    (options.apply || options.manifest || options.dryRun)
  ) {
    throw new Error(
      "--discover cannot be combined with --apply, --manifest, or --dry-run"
    );
  }
  if (options.apply && options.dryRun) {
    throw new Error("--apply and --dry-run cannot be used together");
  }
  if (!options.discover && !options.manifest) {
    throw new Error("Choose --discover or provide --manifest <path>");
  }
  if (options.apply && !options.manifest) {
    throw new Error("--apply requires --manifest <path>");
  }
  return options;
}

function parseManifest(value: unknown): ShowcaseManifest {
  const result = showcaseManifestSchema.safeParse(value);
  if (!result.success) {
    throw new Error("Manifest is invalid.");
  }
  return result.data;
}

export function validateApprovedEntries(
  manifest: ShowcaseManifest,
  categorySlugs: Set<string>
): ShowcaseManifestEntry[] {
  const approved = manifest.entries.filter((entry) => entry.approved);
  const seen = new Set<string>();
  for (const entry of approved) {
    if (!categorySlugs.has(entry.categorySlug)) {
      throw new Error(`Unknown showcase category "${entry.categorySlug}".`);
    }
    const identity = `${entry.provider}:${entry.externalPhotoId}:${entry.categorySlug}`;
    if (seen.has(identity))
      throw new Error(`Duplicate manifest photo "${identity}".`);
    seen.add(identity);
  }
  return approved;
}

async function downloadImage(entry: ShowcaseManifestEntry) {
  const response = await fetch(entry.imageUrl);
  if (!response.ok) {
    throw new Error(
      `Image download failed for Pexels photo ${entry.externalPhotoId}.`
    );
  }
  const contentType = contentTypeFromResponse(response);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 1 || bytes.length > maxImageBytes) {
    throw new Error(
      `Image for Pexels photo ${entry.externalPhotoId} exceeds the allowed size.`
    );
  }
  return { bytes, contentType };
}

async function writeManifest(path: string, manifest: ShowcaseManifest) {
  await Bun.write(path, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Manifest written: ${path}`);
}

async function runDiscover(output: string | null) {
  const environment = parseEnvironment(
    operatorEnvironmentSchema.pick({ PEXELS_API_KEY: true })
  );
  const manifest = await discoverShowcaseManifest(environment.PEXELS_API_KEY);
  if (output) {
    await writeManifest(output, manifest);
  } else {
    console.log(JSON.stringify(manifest, null, 2));
  }
  console.error("Review entries and set approved to true before --apply.");
}

async function runApply(manifestPath: string, apply: boolean) {
  const manifest = parseManifest(
    JSON.parse(await Bun.file(manifestPath).text()) as unknown
  );
  const environment = parseEnvironment(operatorEnvironmentSchema);
  const client = createSupabaseClient({
    supabaseUrl: environment.SUPABASE_URL,
    serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY
  });
  const repository = createShowcaseRepository(client);
  const categories = await repository.loadCategories(
    showcaseCategoryConfigs.map((category) => category.slug)
  );
  const categoriesBySlug = new Map(
    categories.map((category) => [category.slug, category])
  );
  const approved = validateApprovedEntries(
    manifest,
    new Set(categoriesBySlug.keys())
  );

  console.log(`Approved entries: ${approved.length}`);
  if (approved.length === 0) {
    console.log("No approved entries. No database or R2 changes were made.");
    return;
  }
  if (!apply) {
    console.log("Dry run complete. No database or R2 changes were made.");
    return;
  }

  const storage = createR2ObjectStorage({
    accountId: environment.R2_ACCOUNT_ID,
    accessKeyId: environment.R2_ACCESS_KEY_ID,
    secretAccessKey: environment.R2_SECRET_ACCESS_KEY,
    bucket: environment.R2_BUCKET
  });
  let imported = 0;
  let skipped = 0;

  for (const [index, entry] of approved.entries()) {
    const category = categoriesBySlug.get(entry.categorySlug);
    if (!category)
      throw new Error(`Category "${entry.categorySlug}" was not resolved.`);
    const image = await downloadImage(entry);
    const storageKey = buildShowcaseStorageKey(
      entry.provider,
      entry.externalPhotoId,
      image.contentType
    );
    if (!isShowcaseStorageKey(storageKey))
      throw new Error("Generated invalid showcase storage key.");

    const objectAlreadyExisted = await storage.objectExists(storageKey);
    let uploaded = false;
    try {
      await storage.putObject({
        key: storageKey,
        body: image.bytes,
        contentType: image.contentType
      });
      uploaded = !objectAlreadyExisted;
      const result = await repository.upsertShowcaseImage({
        categoryId: category.id,
        provider: entry.provider,
        externalPhotoId: entry.externalPhotoId,
        storageKey,
        sourceReference: entry.photoUrl,
        attributionText: entry.attributionText,
        altText: `${category.name} showcase image by ${entry.photographer}`,
        contentType: image.contentType,
        byteSize: image.bytes.length,
        width: entry.width,
        height: entry.height,
        searchTerm: entry.searchTerm,
        sortOrder: index
      });
      if (result.created) imported += 1;
      else skipped += 1;
      console.log(
        `${result.created ? "IMPORTED" : "SKIPPED"} ${entry.externalPhotoId} (${category.slug})`
      );
    } catch (error) {
      if (uploaded)
        await storage.deleteObject(storageKey).catch(() => undefined);
      throw error;
    }
  }

  console.log(`Imported: ${imported}`);
  console.log(`Skipped existing: ${skipped}`);
}

async function run(options: CliOptions) {
  if (options.help) {
    printHelp();
    return;
  }
  if (options.discover) {
    await runDiscover(options.output);
    return;
  }
  await runApply(options.manifest as string, options.apply);
}

if (import.meta.main) {
  try {
    await run(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(
      error instanceof Error
        ? `Showcase import failed: ${error.message}`
        : "Showcase import failed."
    );
    process.exitCode = 1;
  }
}
