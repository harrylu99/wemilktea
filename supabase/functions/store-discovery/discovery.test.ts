import { expect, test } from "bun:test";
import { runStoreDiscovery, type DiscoveryRepository } from "./discovery";
import {
  createGooglePlacesClient,
  normalizeGooglePlace,
  type GooglePlacesClient,
  type NormalizedGooglePlace
} from "./google-places";

const firstPlace: NormalizedGooglePlace = {
  googlePlaceId: "google-place-1",
  name: "Example Milk Tea",
  latitude: -36.8485,
  longitude: 174.7633
};

function createRepository(
  options: {
    canonicalPlaceIds?: string[];
    possibleDuplicatePlaceIds?: string[];
    failOnUpsert?: boolean;
  } = {}
) {
  const candidates = new Map<string, string>();
  const observations: Array<{ discoveryRunId: string; candidateId: string }> =
    [];
  const finished = [] as Parameters<DiscoveryRepository["finishRun"]>[0][];
  let touchCount = 0;
  let runNumber = 0;

  const repository: DiscoveryRepository = {
    async startRun() {
      runNumber += 1;
      return { id: `run-${runNumber}` };
    },
    async finishRun(result) {
      finished.push(result);
    },
    async findLocationByGooglePlaceId(googlePlaceId) {
      return options.canonicalPlaceIds?.includes(googlePlaceId)
        ? { id: "location-1" }
        : null;
    },
    async findCandidateByGooglePlaceId(googlePlaceId) {
      const id = candidates.get(googlePlaceId);
      return id ? { id } : null;
    },
    async touchCandidate() {
      touchCount += 1;
    },
    async findPossibleLocationDuplicate(place) {
      return options.possibleDuplicatePlaceIds?.includes(place.googlePlaceId)
        ? { id: "location-possible" }
        : null;
    },
    async upsertCandidate({ place }) {
      if (options.failOnUpsert) {
        throw new Error("candidate write failed");
      }

      const id =
        candidates.get(place.googlePlaceId) ??
        `candidate-${candidates.size + 1}`;
      candidates.set(place.googlePlaceId, id);
      return { id };
    },
    async observeCandidate(input) {
      observations.push(input);
    }
  };

  return {
    repository,
    candidates,
    observations,
    finished,
    get touchCount() {
      return touchCount;
    }
  };
}

function createPlacesClient(
  responses: Record<string, NormalizedGooglePlace[] | Error>
): GooglePlacesClient {
  return {
    async searchText({ query }) {
      const response = responses[query] ?? [];

      if (response instanceof Error) {
        throw response;
      }

      return { places: response, nextPageToken: null };
    }
  };
}

test("normalizes the Google fields needed for a candidate", () => {
  expect(
    normalizeGooglePlace({
      id: "google-place-1",
      displayName: { text: " Example Milk Tea " },
      location: { latitude: -36.8485, longitude: 174.7633 },
      formattedAddress: "1 Queen Street, Auckland"
    })
  ).toEqual(firstPlace);
  expect(normalizeGooglePlace({ id: "missing-name" })).toBeNull();
});

test("requests only the transient fields used for discovery classification", async () => {
  let request: Request | null = null;
  const client = createGooglePlacesClient("test-key", async (input, init) => {
    request = new Request(input, init);
    return Response.json({ places: [] });
  });

  await client.searchText({ query: "bubble tea Auckland" });

  expect(request?.headers.get("X-Goog-FieldMask")).toBe(
    "places.id,places.displayName,places.location,nextPageToken"
  );
});

test("creates and observes a new candidate", async () => {
  const fake = createRepository();
  const result = await runStoreDiscovery({
    repository: fake.repository,
    placesClient: createPlacesClient({ first: [firstPlace] }),
    triggerType: "manual",
    searches: ["first"]
  });

  expect(result).toMatchObject({
    status: "succeeded",
    resultCount: 1,
    newCandidateCount: 1,
    knownCount: 0,
    possibleDuplicateCount: 0
  });
  expect(fake.candidates.size).toBe(1);
  expect(fake.observations).toEqual([
    { discoveryRunId: "run-1", candidateId: "candidate-1" }
  ]);
});

test("classifies an existing canonical location as known", async () => {
  const fake = createRepository({
    canonicalPlaceIds: [firstPlace.googlePlaceId]
  });
  const result = await runStoreDiscovery({
    repository: fake.repository,
    placesClient: createPlacesClient({ first: [firstPlace] }),
    triggerType: "manual",
    searches: ["first"]
  });

  expect(result).toMatchObject({ knownCount: 1, newCandidateCount: 0 });
  expect(fake.candidates.size).toBe(0);
});

test("flags a nearby matching location as a possible duplicate", async () => {
  const fake = createRepository({
    possibleDuplicatePlaceIds: [firstPlace.googlePlaceId]
  });
  const result = await runStoreDiscovery({
    repository: fake.repository,
    placesClient: createPlacesClient({ first: [firstPlace] }),
    triggerType: "manual",
    searches: ["first"]
  });

  expect(result).toMatchObject({
    possibleDuplicateCount: 1,
    newCandidateCount: 0
  });
});

test("does not create another candidate when the same place is discovered again", async () => {
  const fake = createRepository();
  const placesClient = createPlacesClient({ first: [firstPlace] });

  await runStoreDiscovery({
    repository: fake.repository,
    placesClient,
    triggerType: "manual",
    searches: ["first"]
  });
  const repeatedResult = await runStoreDiscovery({
    repository: fake.repository,
    placesClient,
    triggerType: "manual",
    searches: ["first"]
  });

  expect(fake.candidates.size).toBe(1);
  expect(repeatedResult).toMatchObject({
    newCandidateCount: 0,
    resultCount: 1
  });
  expect(fake.observations).toHaveLength(2);
  expect(fake.touchCount).toBe(1);
});

test("records a failed run when every Google request fails", async () => {
  const fake = createRepository();
  const result = await runStoreDiscovery({
    repository: fake.repository,
    placesClient: createPlacesClient({ first: new Error("quota exceeded") }),
    triggerType: "manual",
    searches: ["first"]
  });

  expect(result.status).toBe("failed");
  expect(result.errorSummary).toContain("quota exceeded");
  expect(fake.finished).toHaveLength(1);
});

test("completes with an error summary after a partial Google failure", async () => {
  const fake = createRepository();
  const result = await runStoreDiscovery({
    repository: fake.repository,
    placesClient: createPlacesClient({
      first: [firstPlace],
      second: new Error("request failed")
    }),
    triggerType: "manual",
    searches: ["first", "second"]
  });

  expect(result).toMatchObject({ status: "succeeded", newCandidateCount: 1 });
  expect(result.errorSummary).toContain("second");
});

test("finalizes a failed run when a candidate write fails", async () => {
  const fake = createRepository({ failOnUpsert: true });
  const result = await runStoreDiscovery({
    repository: fake.repository,
    placesClient: createPlacesClient({ first: [firstPlace] }),
    triggerType: "manual",
    searches: ["first"]
  });

  expect(result.status).toBe("failed");
  expect(result.errorSummary).toContain("candidate write failed");
  expect(fake.finished).toHaveLength(1);
});
