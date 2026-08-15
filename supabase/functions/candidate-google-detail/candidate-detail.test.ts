import { expect, test } from "bun:test";
import {
  CandidateDetailError,
  getCandidateGoogleDetail
} from "./candidate-detail";
import {
  createGooglePlaceDetailClient,
  normalizeGooglePlaceDetail
} from "./google-place-detail";

const googleDetail = {
  placeId: "ChIJcandidate",
  displayName: "Candidate Tea",
  formattedAddress: "1 Queen Street, Auckland",
  latitude: -36.8485,
  longitude: 174.7633,
  businessStatus: "OPERATIONAL",
  websiteUri: "https://example.test",
  googleMapsUri: "https://maps.google.com/?cid=1",
  attributionLabel: "Google Maps" as const
};

test("normalizes transient Google reference detail and limits requested fields", async () => {
  expect(
    normalizeGooglePlaceDetail({
      id: "ChIJcandidate",
      displayName: { text: "Candidate Tea" },
      formattedAddress: "1 Queen Street, Auckland",
      location: { latitude: -36.8485, longitude: 174.7633 },
      businessStatus: "OPERATIONAL",
      websiteUri: "https://example.test",
      googleMapsUri: "https://maps.google.com/?cid=1"
    })
  ).toEqual(googleDetail);

  let request: Request | null = null;
  const client = createGooglePlaceDetailClient(
    "test-key",
    async (input, init) => {
      request = new Request(input, init);
      return Response.json({
        id: "ChIJcandidate",
        displayName: { text: "Candidate Tea" }
      });
    }
  );
  await client.getPlaceDetail("ChIJcandidate");

  expect(request?.headers.get("X-Goog-FieldMask")).toBe(
    "id,displayName,formattedAddress,location,businessStatus,websiteUri,googleMapsUri"
  );
});

test("returns candidate detail without a candidate persistence side effect", async () => {
  let lookupCount = 0;
  const detail = await getCandidateGoogleDetail({
    candidateId: "candidate-1",
    repository: {
      async findCandidate() {
        lookupCount += 1;
        return { googlePlaceId: "ChIJcandidate", status: "new" };
      }
    },
    googleClient: {
      async getPlaceDetail() {
        return googleDetail;
      }
    }
  });

  expect(detail).toEqual(googleDetail);
  expect(lookupCount).toBe(1);
});

test("does not fetch reference data for missing or reviewed candidates", async () => {
  const googleClient = {
    async getPlaceDetail() {
      throw new Error("Google should not be called");
    }
  };

  await expect(
    getCandidateGoogleDetail({
      candidateId: "missing",
      repository: {
        async findCandidate() {
          return null;
        }
      },
      googleClient
    })
  ).rejects.toMatchObject<CandidateDetailError>({
    code: "candidate_not_found"
  });

  await expect(
    getCandidateGoogleDetail({
      candidateId: "reviewed",
      repository: {
        async findCandidate() {
          return { googlePlaceId: "ChIJcandidate", status: "approved" };
        }
      },
      googleClient
    })
  ).rejects.toMatchObject<CandidateDetailError>({
    code: "candidate_already_reviewed"
  });
});

test("surfaces a Google client failure to the server boundary", async () => {
  await expect(
    getCandidateGoogleDetail({
      candidateId: "candidate-1",
      repository: {
        async findCandidate() {
          return { googlePlaceId: "ChIJcandidate", status: "new" };
        }
      },
      googleClient: {
        async getPlaceDetail() {
          throw new Error("quota failed");
        }
      }
    })
  ).rejects.toThrow("quota failed");
});
