import { operatorEnvironmentSchema, parseEnvironment } from "./config";
import {
  discoverStoreShowcaseManifest,
  MAX_STORE_SHOWCASE_CANDIDATES
} from "./pexels-api";
import {
  createShowcaseRepository,
  createSupabaseClient,
  storeShowcaseImageIdentityKey,
  type ShowcaseRepository
} from "./repository";
import {
  buildShowcaseStorageKey,
  contentTypeFromResponse,
  createR2ObjectStorage,
  isShowcaseStorageKey,
  maxImageBytes,
  supportedContentTypes,
  type R2ObjectStorage,
  type SupportedContentType
} from "./storage";
import {
  storeShowcaseManifestSchema,
  type StoreShowcaseManifest,
  type StoreShowcaseManifestEntry
} from "./types";

type CliOptions = {
  discover: boolean;
  apply: boolean;
  dryRun: boolean;
  manifest: string | null;
  output: string | null;
  help: boolean;
};

type ExistingStoreSource = {
  storageKey: string;
  sourceReference: string | null;
  attributionText: string | null;
  altText: string | null;
  contentType: string | null;
  byteSize: number | null;
  width: number | null;
  height: number | null;
};

function printHelp() {
  console.log(`Usage:
  bun --env-file=.env.local scripts/pexels/import-store-showcase.ts --discover --output <path>
  bun --env-file=.env.local scripts/pexels/import-store-showcase.ts --manifest <path> --dry-run
  bun --env-file=.env.local scripts/pexels/import-store-showcase.ts --apply --manifest <path>

Discovery never writes to R2 or Supabase. Review the manifest and set
approved to true before --apply. The default manifest mode is dry run.
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

function parseManifest(value: unknown): StoreShowcaseManifest {
  const result = storeShowcaseManifestSchema.safeParse(value);
  if (!result.success) throw new Error("Store showcase manifest is invalid.");
  return result.data;
}

export function validateApprovedStoreEntries(
  manifest: StoreShowcaseManifest
): StoreShowcaseManifestEntry[] {
  const approved = manifest.entries.filter((entry) => entry.approved);
  const seen = new Set<string>();
  for (const entry of approved) {
    const identity = storeShowcaseImageIdentityKey(
      entry.provider,
      entry.externalPhotoId
    );
    if (seen.has(identity))
      throw new Error(`Duplicate store manifest photo "${identity}".`);
    seen.add(identity);
  }
  return approved;
}

async function downloadImage(entry: StoreShowcaseManifestEntry) {
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

function reusableSource(source: ExistingStoreSource) {
  return (
    isShowcaseStorageKey(source.storageKey) &&
    supportedContentTypes.includes(
      source.contentType as SupportedContentType
    ) &&
    source.byteSize !== null &&
    source.byteSize > 0 &&
    source.byteSize <= maxImageBytes
  );
}

type ApplyApprovedStoreEntriesInput = {
  approved: StoreShowcaseManifestEntry[];
  existingIdentities: Set<string>;
  existingSources: Map<string, ExistingStoreSource>;
  repository: Pick<ShowcaseRepository, "upsertStoreShowcaseImage">;
  storage: R2ObjectStorage;
  download?: (
    entry: StoreShowcaseManifestEntry
  ) => Promise<{ bytes: Uint8Array; contentType: SupportedContentType }>;
};

export async function applyApprovedStoreEntries({
  approved,
  existingIdentities,
  existingSources,
  repository,
  storage,
  download = downloadImage
}: ApplyApprovedStoreEntriesInput) {
  let imported = 0;
  let skipped = 0;
  let reused = 0;

  for (const [index, entry] of approved.entries()) {
    const identity = storeShowcaseImageIdentityKey(
      entry.provider,
      entry.externalPhotoId
    );
    if (existingIdentities.has(identity)) {
      skipped += 1;
      console.log(
        `SKIPPED ${entry.externalPhotoId}: already exists in store_showcase_image_pool`
      );
      continue;
    }

    const source = existingSources.get(entry.externalPhotoId);
    let contentType: SupportedContentType;
    let byteSize: number;
    let storageKey: string;
    let uploaded = false;
    let objectAlreadyExisted = false;

    if (source && reusableSource(source)) {
      contentType = source.contentType as SupportedContentType;
      byteSize = source.byteSize as number;
      storageKey = source.storageKey;
      reused += 1;
      console.log(
        `REUSE ${entry.externalPhotoId}: existing Pexels stock asset`
      );
    } else {
      const image = await download(entry);
      contentType = image.contentType;
      byteSize = image.bytes.length;
      storageKey = buildShowcaseStorageKey(
        entry.provider,
        entry.externalPhotoId,
        contentType
      );
      if (!isShowcaseStorageKey(storageKey))
        throw new Error("Generated invalid showcase storage key.");
      objectAlreadyExisted = await storage.objectExists(storageKey);
      await storage.putObject({
        key: storageKey,
        body: image.bytes,
        contentType
      });
      uploaded = !objectAlreadyExisted;
    }

    try {
      const result = await repository.upsertStoreShowcaseImage({
        provider: entry.provider,
        externalPhotoId: entry.externalPhotoId,
        storageKey,
        sourceReference: source?.sourceReference ?? entry.photoUrl,
        attributionText: source?.attributionText ?? entry.attributionText,
        altText: source?.altText ?? "Bubble tea shop interior",
        contentType,
        byteSize,
        width: source?.width ?? entry.width,
        height: source?.height ?? entry.height,
        searchTerm: entry.searchTerm,
        sortOrder: index
      });
      existingIdentities.add(identity);
      if (result.created) imported += 1;
      else skipped += 1;
      console.log(
        `${result.created ? "IMPORTED" : "SKIPPED"} ${entry.externalPhotoId}`
      );
    } catch (error) {
      if (uploaded)
        await storage.deleteObject(storageKey).catch(() => undefined);
      throw error;
    }
  }

  return { imported, reused, skipped };
}

async function writeManifest(path: string, manifest: StoreShowcaseManifest) {
  await Bun.write(path, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Manifest written: ${path}`);
}

async function runDiscover(output: string | null) {
  const environment = parseEnvironment(
    operatorEnvironmentSchema.pick({ PEXELS_API_KEY: true })
  );
  const manifest = await discoverStoreShowcaseManifest(
    environment.PEXELS_API_KEY
  );
  if (output) await writeManifest(output, manifest);
  else console.log(JSON.stringify(manifest, null, 2));
  console.error(
    `Discovered ${manifest.entries.length} candidates (maximum ${MAX_STORE_SHOWCASE_CANDIDATES}). Review entries and set approved to true before --apply.`
  );
}

async function runManifest(manifestPath: string, apply: boolean) {
  const manifest = parseManifest(
    JSON.parse(await Bun.file(manifestPath).text()) as unknown
  );
  const environment = parseEnvironment(operatorEnvironmentSchema);
  const repository = createShowcaseRepository(
    createSupabaseClient({
      supabaseUrl: environment.SUPABASE_URL,
      serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY
    })
  );
  const approved = validateApprovedStoreEntries(manifest);
  console.log(`Approved entries: ${approved.length}`);
  if (approved.length === 0) {
    console.log("No approved entries. No database or R2 changes were made.");
    return;
  }

  const existingIdentities =
    await repository.loadStoreShowcaseImageIdentities();
  const existingSources = await repository.loadExistingShowcaseImageSources(
    approved.map((entry) => entry.externalPhotoId)
  );
  for (const entry of approved) {
    const identity = storeShowcaseImageIdentityKey(
      entry.provider,
      entry.externalPhotoId
    );
    if (existingIdentities.has(identity))
      console.log(`SKIP ${entry.externalPhotoId}`);
    else if (existingSources.has(entry.externalPhotoId))
      console.log(`WOULD REUSE ${entry.externalPhotoId}: existing stock asset`);
    else console.log(`WOULD IMPORT ${entry.externalPhotoId}`);
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
  const result = await applyApprovedStoreEntries({
    approved,
    existingIdentities,
    existingSources,
    repository,
    storage
  });
  console.log(`Imported: ${result.imported}`);
  console.log(`Reused existing assets: ${result.reused}`);
  console.log(`Skipped existing: ${result.skipped}`);
}

async function run(options: CliOptions) {
  if (options.help) return printHelp();
  if (options.discover) return runDiscover(options.output);
  return runManifest(options.manifest as string, options.apply);
}

if (import.meta.main) {
  try {
    await run(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(
      error instanceof Error
        ? `Store showcase import failed: ${error.message}`
        : "Store showcase import failed."
    );
    process.exitCode = 1;
  }
}
