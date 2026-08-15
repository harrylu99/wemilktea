import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiscoveryRepository, DiscoveryResult } from "./discovery.ts";

function assertDatabaseSuccess(error: unknown) {
  if (error) {
    console.error("Supabase database error:", error);

    const message =
      typeof error === "object" &&
      error !== null &&
      "message" in error
        ? String(error.message)
        : "Unknown database error";

    throw new Error(`Database operation failed: ${message}`);
  }
}

export function createDiscoveryRepository(
  client: SupabaseClient
): DiscoveryRepository {
  const findCandidateByGooglePlaceId = async (googlePlaceId: string) => {
    const { data, error } = await client
      .from("store_candidates")
      .select("id")
      .eq("google_place_id", googlePlaceId)
      .maybeSingle();

    assertDatabaseSuccess(error);
    return data && typeof data.id === "string" ? { id: data.id } : null;
  };

  return {
    async startRun(triggerType) {
      const { data, error } = await client
        .from("discovery_runs")
        .insert({ trigger_type: triggerType, status: "running" })
        .select("id")
        .single();

      assertDatabaseSuccess(error);

      if (!data || typeof data.id !== "string") {
        throw new Error("Database did not return a discovery run ID.");
      }

      return { id: data.id };
    },

    async finishRun(result: DiscoveryResult) {
      const { error } = await client
        .from("discovery_runs")
        .update({
          status: result.status,
          finished_at: new Date().toISOString(),
          query_count: result.queryCount,
          result_count: result.resultCount,
          new_candidate_count: result.newCandidateCount,
          known_count: result.knownCount,
          duplicate_count: result.possibleDuplicateCount,
          error_summary: result.errorSummary
        })
        .eq("id", result.runId);

      assertDatabaseSuccess(error);
    },

    async findLocationByGooglePlaceId(googlePlaceId) {
      const { data, error } = await client
        .from("locations")
        .select("id")
        .eq("google_place_id", googlePlaceId)
        .maybeSingle();

      assertDatabaseSuccess(error);
      return data && typeof data.id === "string" ? { id: data.id } : null;
    },

    async findCandidateByGooglePlaceId(googlePlaceId) {
      return findCandidateByGooglePlaceId(googlePlaceId);
    },

    async touchCandidate(candidateId) {
      const { error } = await client
        .from("store_candidates")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", candidateId);

      assertDatabaseSuccess(error);
    },

    async findPossibleLocationDuplicate(place) {
      if (place.latitude === null || place.longitude === null) {
        return null;
      }

      const { data, error } = await client.rpc(
        "find_possible_location_duplicate",
        {
          candidate_name: place.name,
          candidate_latitude: place.latitude,
          candidate_longitude: place.longitude
        }
      );

      assertDatabaseSuccess(error);
      return typeof data === "string" ? { id: data } : null;
    },

    async upsertCandidate({ place, status, possibleLocationId }) {
      const { data, error } = await client
        .from("store_candidates")
        .upsert(
          {
            google_place_id: place.googlePlaceId,
            source_provenance: "google",
            status,
            possible_location_id: possibleLocationId
          },
          { onConflict: "google_place_id", ignoreDuplicates: true }
        )
        .select("id")
        .maybeSingle();

      assertDatabaseSuccess(error);

      if (data && typeof data.id === "string") {
        return { id: data.id };
      }

      const existing = await findCandidateByGooglePlaceId(place.googlePlaceId);

      if (!existing) {
        throw new Error("Candidate conflict could not be resolved.");
      }

      return existing;
    },

    async observeCandidate({ discoveryRunId, candidateId }) {
      const { error } = await client
        .from("store_candidate_observations")
        .upsert(
          {
            discovery_run_id: discoveryRunId,
            candidate_id: candidateId
          },
          {
            onConflict: "discovery_run_id,candidate_id",
            ignoreDuplicates: true
          }
        );

      assertDatabaseSuccess(error);
    }
  };
}
