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
  const run = await repository.startRun(triggerType);
  const result = initialResult(run.id);
  const errors: string[] = [];
  const processedPlaceIds = new Set<string>();
  let successfulSearches = 0;

  try {
    for (const query of searches) {
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
          break;
        }

        successfulSearches += 1;

        for (const place of response.places) {
          if (processedPlaceIds.has(place.googlePlaceId)) {
            continue;
          }

          processedPlaceIds.add(place.googlePlaceId);
          result.resultCount += 1;
          await processPlace(repository, run.id, place, result);
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

  return result;
}
