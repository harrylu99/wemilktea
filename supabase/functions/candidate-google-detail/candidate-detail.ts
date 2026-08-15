import type { GooglePlaceDetail } from "./google-place-detail.ts";

type Candidate = {
  googlePlaceId: string;
  status: string;
};

export type CandidateDetailRepository = {
  findCandidate(candidateId: string): Promise<Candidate | null>;
};

export type CandidateDetailClient = {
  getPlaceDetail(googlePlaceId: string): Promise<GooglePlaceDetail>;
};

export class CandidateDetailError extends Error {
  constructor(
    readonly code: "candidate_not_found" | "candidate_already_reviewed"
  ) {
    super(code);
    this.name = "CandidateDetailError";
  }
}

export async function getCandidateGoogleDetail({
  candidateId,
  repository,
  googleClient
}: {
  candidateId: string;
  repository: CandidateDetailRepository;
  googleClient: CandidateDetailClient;
}) {
  const candidate = await repository.findCandidate(candidateId);

  if (!candidate) {
    throw new CandidateDetailError("candidate_not_found");
  }

  if (candidate.status === "approved" || candidate.status === "rejected") {
    throw new CandidateDetailError("candidate_already_reviewed");
  }

  return googleClient.getPlaceDetail(candidate.googlePlaceId);
}
