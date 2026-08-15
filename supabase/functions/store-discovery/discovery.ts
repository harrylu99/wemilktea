import {
  discoveryRequestConfig,
  discoverySearches
} from "./discovery-config.ts";
import type {
  GooglePlacesClient,
  NormalizedGooglePlace
} from "./google-places.ts";

export type DiscoveryRunStatus = "succeeded" | "failed";

export type DiscoveryResult = {
  runId: string;
  status: DiscoveryRunStatus;
  queryCount: number;
  resultCount: number;
  newCandidateCount: number;
  knownCount: number;
  possibleDuplicateCount: number;
  errorSummary: string | null;
};

type ExistingCandidate = {
  id: string;
};

export type DiscoveryRepository = {
  startRun(triggerType: "manual" | "scheduled"): Promise<{ id: string }>;
  finishRun(result: DiscoveryResult): Promise<void>;
  findLocationByGooglePlaceId(
    googlePlaceId: string
  ): Promise<{ id: string } | null>;
  findCandidateByGooglePlaceId(
    googlePlaceId: string
  ): Promise<ExistingCandidate | null>;
  touchCandidate(candidateId: string): Promise<void>;
  findPossibleLocationDuplicate(
    place: NormalizedGooglePlace
  ): Promise<{ id: string } | null>;
  upsertCandidate(input: {
    place: NormalizedGooglePlace;
    status: "new" | "possible_duplicate";
    possibleLocationId: string | null;
  }): Promise<ExistingCandidate>;
  observeCandidate(input: {
    discoveryRunId: string;
    candidateId: string;
  }): Promise<void>;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown discovery error.";
}

function summarizeErrors(errors: string[]) {
  if (errors.length === 0) {
    return null;
  }

  const suffix = errors.length > 3 ? ` (+${errors.length - 3} more)` : "";
  return `${errors.slice(0, 3).join(" ")}${suffix}`;
}

function elapsedMilliseconds(startTime: number) {
  return Math.round(performance.now() - startTime);
}

function initialResult(runId: string): DiscoveryResult {
  return {
    runId,
    status: "succeeded",
    queryCount: 0,
    resultCount: 0,
    newCandidateCount: 0,
    knownCount: 0,
    possibleDuplicateCount: 0,
    errorSummary: null
  };
}

async function processPlace(
  repository: DiscoveryRepository,
  discoveryRunId: string,
  place: NormalizedGooglePlace,
  result: DiscoveryResult
) {
  const canonicalLocation = await repository.findLocationByGooglePlaceId(
    place.googlePlaceId
  );

  if (canonicalLocation) {
    result.knownCount += 1;
    return;
  }

  const existingCandidate = await repository.findCandidateByGooglePlaceId(
    place.googlePlaceId
  );

  if (existingCandidate) {
    await repository.touchCandidate(existingCandidate.id);
    await repository.observeCandidate({
      discoveryRunId,
      candidateId: existingCandidate.id
    });
    return;
  }

  const possibleLocation =
    await repository.findPossibleLocationDuplicate(place);
  const candidate = await repository.upsertCandidate({
    place,
    status: possibleLocation ? "possible_duplicate" : "new",
    possibleLocationId: possibleLocation?.id ?? null
  });

  await repository.observeCandidate({
    discoveryRunId,
    candidateId: candidate.id
  });

  if (possibleLocation) {
    result.possibleDuplicateCount += 1;
  } else {
    result.newCandidateCount += 1;
  }
}

export async function runStoreDiscovery({
  repository,
  placesClient,
  triggerType,
  searches = discoverySearches
}: {
  repository: DiscoveryRepository;
  placesClient: GooglePlacesClient;
  triggerType: "manual" | "scheduled";
  searches?: readonly string[];
}): Promise<DiscoveryResult> {
  const startTime = performance.now();
  const run = await repository.startRun(triggerType);
  const result = initialResult(run.id);
  const errors: string[] = [];
  const processedPlaceIds = new Set<string>();
  let successfulSearches = 0;

  console.info("Store discovery started.", {
    runId: run.id,
    triggerType,
    queryCount: searches.length,
    elapsedMs: elapsedMilliseconds(startTime)
  });

  try {
    for (const [queryIndex, query] of searches.entries()) {
      result.queryCount += 1;
      let pageToken: string | undefined;

      for (
        let page = 0;
        page < discoveryRequestConfig.maxPagesPerSearch;
        page += 1
      ) {
        let response;

        try {
          response = await placesClient.searchText({ query, pageToken });
        } catch (error) {
          errors.push(`“${query}” failed: ${errorMessage(error)}`);
          console.warn("Store discovery Google search page failed.", {
            query,
            queryIndex: queryIndex + 1,
            page: page + 1,
            elapsedMs: elapsedMilliseconds(startTime),
            error: errorMessage(error)
          });
          break;
        }

        successfulSearches += 1;

        console.info("Store discovery Google search page completed.", {
          query,
          queryIndex: queryIndex + 1,
          page: page + 1,
          placeCount: response.places.length,
          elapsedMs: elapsedMilliseconds(startTime)
        });

        for (const place of response.places) {
          if (processedPlaceIds.has(place.googlePlaceId)) {
            continue;
          }

          processedPlaceIds.add(place.googlePlaceId);
          result.resultCount += 1;
          await processPlace(repository, run.id, place, result);

          if (result.resultCount % 25 === 0) {
            console.info("Store discovery progress.", {
              runId: run.id,
              elapsedMs: elapsedMilliseconds(startTime),
              queryIndex: queryIndex + 1,
              processedResultCount: result.resultCount,
              newCandidateCount: result.newCandidateCount,
              knownCount: result.knownCount,
              possibleDuplicateCount: result.possibleDuplicateCount
            });
          }
        }

        if (!response.nextPageToken) {
          break;
        }

        pageToken = response.nextPageToken;
      }
    }

    if (successfulSearches === 0) {
      result.status = "failed";
    }
  } catch (error) {
    result.status = "failed";
    errors.push(`Discovery stopped: ${errorMessage(error)}`);
  }

  result.errorSummary = summarizeErrors(errors);

  try {
    await repository.finishRun(result);
  } catch (error) {
    throw new Error(`Could not finalize discovery run: ${errorMessage(error)}`);
  }

  console.info("Store discovery finished.", {
    runId: run.id,
    status: result.status,
    elapsedMs: elapsedMilliseconds(startTime),
    queryCount: result.queryCount,
    resultCount: result.resultCount,
    newCandidateCount: result.newCandidateCount,
    knownCount: result.knownCount,
    possibleDuplicateCount: result.possibleDuplicateCount
  });

  return result;
}
