import {
  brandOptionSchema,
  type BrandOption,
  candidateGoogleDetailSchema,
  type CandidateGoogleDetail,
  locationOptionSchema,
  type LocationOption,
  mergeStoreCandidateSchema,
  rejectStoreCandidateSchema,
  storeCandidateSummarySchema,
  type StoreCandidateSummary
} from "@wemilktea/validation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams
} from "react-router-dom";
import {
  type CandidateApprovalField,
  validateCandidateApprovalForm
} from "./candidate-review-form";
import {
  candidateFilterFromSearchParams,
  candidateFilterLabel,
  candidateReviewReturnPath,
  candidateFilters,
  type CandidateFilter,
  searchParamsForCandidateFilter
} from "./candidate-filter";
import { DiscoveryControl } from "./discovery-control";
import { slugify } from "./lib/slug";
import { supabase, supabaseConfigurationError } from "./lib/supabase";
import { formatStatusLabel } from "./lib/status-label";
import { ManagementDetailSkeleton, ManagementTableSkeleton } from "./loading";

const rejectionReasons = [
  ["not_milk_tea", "Not a milk-tea store"],
  ["duplicate", "Duplicate"],
  ["incorrect_location", "Incorrect location"],
  ["permanently_closed", "Permanently closed"],
  ["outside_scope", "Outside WeMilktea scope"],
  ["other", "Other"]
] as const;

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-NZ", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(new Date(value))
    : "—";
}

function friendlyMutationError(message: string | undefined) {
  switch (message) {
    case "candidate_not_reviewable":
      return "This candidate has already been reviewed.";
    case "target_location_google_place_conflict":
      return "The selected location already belongs to a different Google Place ID.";
    case "target_location_not_found":
      return "The selected canonical location is no longer available.";
    case "brand_not_found":
      return "The selected brand is no longer available.";
    case "invalid_brand_resolution":
    case "invalid_location_data":
    case "invalid_new_brand":
      return "Check the canonical store details and try again.";
    case "invalid_rejection_reason":
      return "Choose a valid rejection reason.";
    default:
      return message?.includes("duplicate key")
        ? "That brand or location slug already exists. Choose a unique slug."
        : "The candidate could not be updated. Please try again.";
  }
}

function PageState({ message }: { message: string }) {
  return <p className="text-sm text-muted-foreground">{message}</p>;
}

function CandidateFieldError({
  field,
  errors
}: {
  field: CandidateApprovalField;
  errors: Partial<Record<CandidateApprovalField, string>>;
}) {
  const message = errors[field];
  return message ? (
    <p
      className="mt-1 text-sm text-destructive"
      id={`candidate-review-error-${field}`}
      role="alert"
    >
      {message}
    </p>
  ) : null;
}

function RequiredMark() {
  return (
    <>
      <span aria-hidden="true"> *</span>
      <span className="sr-only"> required</span>
    </>
  );
}

export function CandidateQueuePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [candidates, setCandidates] = useState<StoreCandidateSummary[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const filter = candidateFilterFromSearchParams(searchParams);

  const loadCandidates = useCallback(async () => {
    const client = supabase;

    if (!client) {
      setErrorMessage(supabaseConfigurationError);
      setIsLoading(false);
      return false;
    }

    setIsLoading(true);
    const { data, error } = await client
      .from("store_candidates")
      .select(
        "id, google_place_id, status, source_provenance, first_seen_at, last_seen_at, reviewed_at, possible_location_id, resolved_location_id, rejection_reason"
      )
      .order("last_seen_at", { ascending: false });

    let loaded = false;
    if (error) {
      setErrorMessage("Candidates could not be loaded. Please try again.");
    } else {
      const parsed = storeCandidateSummarySchema.array().safeParse(data);
      if (!parsed.success) {
        setErrorMessage("Candidates returned an invalid response.");
      } else {
        setErrorMessage(null);
        setCandidates(parsed.data);
        loaded = true;
      }
    }

    setIsLoading(false);
    return loaded;
  }, []);

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

  const visibleCandidates = useMemo(
    () =>
      filter === "all"
        ? candidates
        : candidates.filter((candidate) => candidate.status === filter),
    [candidates, filter]
  );

  return (
    <section>
      <h1 className="text-2xl font-semibold">Candidates</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Discovery identities awaiting human review. Google reference data is
        loaded only when you open a candidate.
      </p>

      <label
        className="mt-6 block max-w-xs text-sm font-medium"
        htmlFor="candidate-filter"
      >
        Filter candidates
        <select
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          id="candidate-filter"
          value={filter}
          onChange={(event) => {
            setSearchParams(
              searchParamsForCandidateFilter(
                searchParams,
                event.target.value as CandidateFilter
              )
            );
          }}
        >
          {candidateFilters.map((value) => (
            <option key={value} value={value}>
              {candidateFilterLabel(value)}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-card">
        {isLoading ? (
          <ManagementTableSkeleton
            label="Loading candidates"
            minWidth="48rem"
          />
        ) : null}
        {errorMessage ? (
          <p className="p-4 text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        ) : null}
        {!isLoading && !errorMessage && visibleCandidates.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No candidates match this filter.
          </p>
        ) : null}
        {!isLoading && !errorMessage && visibleCandidates.length > 0 ? (
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="border-b border-border bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Google Place ID</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">First discovered</th>
                <th className="px-4 py-3 font-medium">Reviewed</th>
                <th className="px-4 py-3 font-medium">Match</th>
                <th className="px-4 py-3 font-medium">
                  <span className="sr-only">Review</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleCandidates.map((candidate) => (
                <tr
                  className="border-b border-border last:border-0"
                  key={candidate.id}
                >
                  <td className="px-4 py-3 font-mono text-xs">
                    {candidate.google_place_id}
                  </td>
                  <td className="px-4 py-3 capitalize">
                    {formatStatusLabel(candidate.status)}
                  </td>
                  <td className="px-4 py-3">
                    {formatDate(candidate.first_seen_at)}
                  </td>
                  <td className="px-4 py-3">
                    {formatDate(candidate.reviewed_at)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {candidate.resolved_location_id ??
                      candidate.possible_location_id ??
                      "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      className="rounded-md border border-border px-3 py-2 font-medium hover:bg-muted"
                      to={`/candidates/${candidate.id}`}
                      state={{
                        returnTo: `${location.pathname}${location.search}`
                      }}
                    >
                      Review
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
      <DiscoveryControl onDiscoverySuccess={loadCandidates} />
    </section>
  );
}

export function CandidateReviewPage() {
  const { candidateId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [candidate, setCandidate] = useState<StoreCandidateSummary | null>(
    null
  );
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [googleDetail, setGoogleDetail] =
    useState<CandidateGoogleDetail | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingReference, setIsLoadingReference] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [brandMode, setBrandMode] = useState<"existing" | "new">("existing");
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [newBrandName, setNewBrandName] = useState("");
  const [newBrandSlug, setNewBrandSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [locationSlug, setLocationSlug] = useState("");
  const [suburb, setSuburb] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [sourceReference, setSourceReference] = useState("");
  const [approvalFieldErrors, setApprovalFieldErrors] = useState<
    Partial<Record<CandidateApprovalField, string>>
  >({});
  const [mergeSearch, setMergeSearch] = useState("");
  const [targetLocationId, setTargetLocationId] = useState("");
  const [rejectionReason, setRejectionReason] = useState("not_milk_tea");
  const returnToCandidates = candidateReviewReturnPath(location.state);

  useEffect(() => {
    const client = supabase;

    if (!client || !candidateId) {
      setErrorMessage(
        candidateId ? supabaseConfigurationError : "Candidate not found."
      );
      setIsLoading(false);
      return;
    }

    const load = async () => {
      setIsLoading(true);
      const [candidateResult, brandResult, locationResult] = await Promise.all([
        client
          .from("store_candidates")
          .select(
            "id, google_place_id, status, source_provenance, first_seen_at, last_seen_at, reviewed_at, possible_location_id, resolved_location_id, rejection_reason"
          )
          .eq("id", candidateId)
          .maybeSingle(),
        client.from("brands").select("id, name, slug").order("name"),
        client
          .from("locations")
          .select(
            "id, display_name, slug, suburb, publication_status, google_place_id"
          )
          .order("display_name")
      ]);

      if (candidateResult.error || !candidateResult.data) {
        setErrorMessage("Candidate not found or access is unavailable.");
      } else {
        const parsed = storeCandidateSummarySchema.safeParse(
          candidateResult.data
        );
        if (!parsed.success) {
          setErrorMessage("Candidate returned an invalid response.");
        } else {
          setCandidate(parsed.data);
        }
      }

      const parsedBrands = brandOptionSchema
        .array()
        .safeParse(brandResult.data);
      const parsedLocations = locationOptionSchema
        .array()
        .safeParse(locationResult.data);
      if (
        brandResult.error ||
        locationResult.error ||
        !parsedBrands.success ||
        !parsedLocations.success
      ) {
        setErrorMessage("Candidate reference lists could not be loaded.");
      } else {
        setBrands(parsedBrands.data);
        setLocations(parsedLocations.data);
        if (parsedBrands.data[0]) {
          setSelectedBrandId(parsedBrands.data[0].id);
        }
      }

      setIsLoading(false);
    };

    void load();
  }, [candidateId]);

  const isReviewable =
    candidate?.status === "new" || candidate?.status === "possible_duplicate";
  const matchingLocations = locations.filter((location) =>
    `${location.display_name} ${location.suburb} ${location.slug}`
      .toLowerCase()
      .includes(mergeSearch.toLowerCase())
  );

  const clearApprovalFieldError = (field: CandidateApprovalField) => {
    setApprovalFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const loadGoogleReference = async () => {
    if (!supabase || !candidate) return;

    setReferenceError(null);
    setIsLoadingReference(true);
    const { data, error } = await supabase.functions.invoke(
      "candidate-google-detail",
      {
        body: { candidateId: candidate.id }
      }
    );
    setIsLoadingReference(false);

    if (error) {
      setReferenceError(
        "Google reference data is unavailable. You can still review verified WeMilktea data."
      );
      return;
    }

    const parsed = candidateGoogleDetailSchema.safeParse(data);
    if (!parsed.success) {
      setReferenceError("Google reference data returned an invalid response.");
      return;
    }

    setGoogleDetail(parsed.data);

    if (parsed.data.displayName) {
      setDisplayName((current) => {
        if (current.trim()) return current;
        return parsed.data.displayName;
      });
      setLocationSlug((current) => {
        if (current.trim()) return current;
        return slugify(parsed.data.displayName);
      });
    }
    if (parsed.data.formattedAddress) {
      setAddress((current) => {
        if (current.trim()) return current;
        return parsed.data.formattedAddress ?? current;
      });
    }
    if (parsed.data.latitude !== null) {
      setLatitude((current) => {
        if (current.trim()) return current;
        return String(parsed.data.latitude);
      });
    }
    if (parsed.data.longitude !== null) {
      setLongitude((current) => {
        if (current.trim()) return current;
        return String(parsed.data.longitude);
      });
    }
    if (parsed.data.googleMapsUri) {
      setSourceReference((current) => {
        if (current.trim()) return current;
        return parsed.data.googleMapsUri ?? current;
      });
    }
  };

  const approve = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!candidate || !supabase) return;

    const validation = validateCandidateApprovalForm({
      candidateId: candidate.id,
      brandMode,
      selectedBrandId,
      newBrandName,
      newBrandSlug,
      displayName,
      locationSlug,
      suburb,
      address,
      latitude,
      longitude,
      sourceReference
    });
    setApprovalFieldErrors(validation.errors);

    if (!validation.input) {
      setErrorMessage(null);
      return;
    }

    if (
      !window.confirm(
        "Approve this candidate and create a draft canonical store?"
      )
    )
      return;

    setErrorMessage(null);
    setIsSubmitting(true);
    const input = validation.input;
    const { error } = await supabase.rpc("approve_store_candidate", {
      p_candidate_id: input.candidateId,
      p_brand_id: input.brand.mode === "existing" ? input.brand.brandId : null,
      p_new_brand_name: input.brand.mode === "new" ? input.brand.name : null,
      p_new_brand_slug: input.brand.mode === "new" ? input.brand.slug : null,
      p_display_name: input.location.displayName,
      p_location_slug: input.location.slug,
      p_suburb: input.location.suburb,
      p_address: input.location.address,
      p_latitude: input.location.latitude,
      p_longitude: input.location.longitude,
      p_source_reference: input.location.sourceReference ?? null
    });
    setIsSubmitting(false);

    if (error) {
      setErrorMessage(friendlyMutationError(error.message));
      return;
    }

    navigate(returnToCandidates, { replace: true });
  };

  const merge = async () => {
    if (!candidate || !supabase) return;
    const parsed = mergeStoreCandidateSchema.safeParse({
      candidateId: candidate.id,
      targetLocationId
    });

    if (!parsed.success) {
      setErrorMessage("Select a canonical location to merge with.");
      return;
    }

    if (
      !window.confirm(
        "Merge this candidate with the selected canonical location?"
      )
    )
      return;

    setErrorMessage(null);
    setIsSubmitting(true);
    const { error } = await supabase.rpc("merge_store_candidate", {
      p_candidate_id: parsed.data.candidateId,
      p_target_location_id: parsed.data.targetLocationId
    });
    setIsSubmitting(false);

    if (error) {
      setErrorMessage(friendlyMutationError(error.message));
      return;
    }

    navigate(returnToCandidates, { replace: true });
  };

  const reject = async () => {
    if (!candidate || !supabase) return;
    const parsed = rejectStoreCandidateSchema.safeParse({
      candidateId: candidate.id,
      reason: rejectionReason
    });

    if (!parsed.success) {
      setErrorMessage("Choose a rejection reason.");
      return;
    }

    if (
      !window.confirm(
        "Reject this candidate? It will remain in the audit trail."
      )
    )
      return;

    setErrorMessage(null);
    setIsSubmitting(true);
    const { error } = await supabase.rpc("reject_store_candidate", {
      p_candidate_id: parsed.data.candidateId,
      p_rejection_reason: parsed.data.reason
    });
    setIsSubmitting(false);

    if (error) {
      setErrorMessage(friendlyMutationError(error.message));
      return;
    }

    navigate(returnToCandidates, { replace: true });
  };

  if (isLoading) {
    return (
      <ManagementDetailSkeleton
        label="Loading candidate review"
        className="max-w-4xl"
      />
    );
  }
  if (!candidate)
    return <PageState message={errorMessage ?? "Candidate not found."} />;

  return (
    <section className="max-w-4xl">
      <Link
        className="text-sm font-medium text-primary hover:underline"
        replace
        to={returnToCandidates}
      >
        ← Candidates
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Candidate review</h1>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            {candidate.google_place_id}
          </p>
        </div>
        <p className="rounded-full bg-muted px-3 py-1 text-sm font-medium capitalize">
          {formatStatusLabel(candidate.status)}
        </p>
      </div>
      {errorMessage ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <section className="mt-8 rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted-foreground">
              GOOGLE REFERENCE
            </p>
            <h2 className="mt-1 text-lg font-semibold">
              What Google currently reports
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Transient reference data only; it is never saved to the candidate.
            </p>
          </div>
          {isReviewable && !googleDetail ? (
            <button
              className="rounded-md border border-border px-3 py-2 text-sm font-medium"
              type="button"
              disabled={isLoadingReference}
              onClick={loadGoogleReference}
            >
              {isLoadingReference
                ? "Loading reference…"
                : "Load Google reference"}
            </button>
          ) : null}
        </div>
        {referenceError ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {referenceError}
          </p>
        ) : null}
        {googleDetail ? (
          <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <p>
              <span className="font-medium">Name:</span>{" "}
              {googleDetail.displayName}
            </p>
            <p>
              <span className="font-medium">Status:</span>{" "}
              {googleDetail.businessStatus ?? "Unavailable"}
            </p>
            <p className="sm:col-span-2">
              <span className="font-medium">Address:</span>{" "}
              {googleDetail.formattedAddress ?? "Unavailable"}
            </p>
            <p>
              <span className="font-medium">Coordinates:</span>{" "}
              {googleDetail.latitude ?? "—"}, {googleDetail.longitude ?? "—"}
            </p>
            {googleDetail.websiteUri ? (
              <a
                className="text-primary hover:underline"
                href={googleDetail.websiteUri}
                rel="noreferrer"
                target="_blank"
              >
                Official website ↗
              </a>
            ) : null}
            {googleDetail.googleMapsUri ? (
              <a
                className="text-primary hover:underline"
                href={googleDetail.googleMapsUri}
                rel="noreferrer"
                target="_blank"
              >
                Open in Google Maps ↗
              </a>
            ) : null}
            <p
              className="sm:col-span-2 text-xs text-muted-foreground"
              translate="no"
            >
              Data source: {googleDetail.attributionLabel}
            </p>
          </div>
        ) : null}
      </section>

      {isReviewable ? (
        <>
          <form
            className="mt-8 rounded-lg border border-border bg-card p-5"
            noValidate
            onSubmit={approve}
          >
            <p className="text-xs font-semibold tracking-wide text-muted-foreground">
              WEMILKTEA CANONICAL STORE DATA
            </p>
            <h2 className="mt-1 text-lg font-semibold">
              Create canonical store
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Verify the business identity and physical branch separately.
              Approval creates a draft store; it does not publish it.
            </p>
            <fieldset className="mt-6 rounded-md border border-border p-4">
              <legend className="px-1 text-sm font-semibold">Brand</legend>
              <p className="mt-1 text-sm text-muted-foreground">
                The business identity. A brand can have multiple stores and does
                not have coordinates.
              </p>
              <div
                aria-describedby={
                  approvalFieldErrors.brand
                    ? "candidate-review-error-brand"
                    : undefined
                }
                className="mt-4 flex flex-wrap gap-4 text-sm"
                role="radiogroup"
              >
                <label>
                  <input
                    checked={brandMode === "existing"}
                    name="brand-mode"
                    type="radio"
                    onChange={() => {
                      setBrandMode("existing");
                      clearApprovalFieldError("brand");
                      clearApprovalFieldError("newBrandName");
                      clearApprovalFieldError("newBrandSlug");
                    }}
                  />{" "}
                  Existing brand
                </label>
                <label>
                  <input
                    checked={brandMode === "new"}
                    name="brand-mode"
                    type="radio"
                    onChange={() => {
                      setBrandMode("new");
                      clearApprovalFieldError("brand");
                    }}
                  />{" "}
                  Create new brand
                </label>
              </div>
              {brandMode === "existing" ? (
                <div className="mt-4">
                  <label
                    className="text-sm font-medium"
                    htmlFor="candidate-brand"
                  >
                    Existing brand <RequiredMark />
                  </label>
                  <select
                    aria-describedby={
                      approvalFieldErrors.brand
                        ? "candidate-review-error-brand"
                        : undefined
                    }
                    aria-invalid={Boolean(approvalFieldErrors.brand)}
                    aria-required="true"
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    id="candidate-brand"
                    value={selectedBrandId}
                    onChange={(event) => {
                      setSelectedBrandId(event.target.value);
                      clearApprovalFieldError("brand");
                    }}
                  >
                    <option value="">Select a brand</option>
                    {brands.map((brand) => (
                      <option key={brand.id} value={brand.id}>
                        {brand.name}
                      </option>
                    ))}
                  </select>
                  <CandidateFieldError
                    errors={approvalFieldErrors}
                    field="brand"
                  />
                </div>
              ) : (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      className="text-sm font-medium"
                      htmlFor="candidate-new-brand-name"
                    >
                      Brand name <RequiredMark />
                    </label>
                    <input
                      aria-describedby={
                        approvalFieldErrors.newBrandName
                          ? "candidate-review-error-newBrandName"
                          : undefined
                      }
                      aria-invalid={Boolean(approvalFieldErrors.newBrandName)}
                      aria-required="true"
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      id="candidate-new-brand-name"
                      placeholder="Enter brand name"
                      value={newBrandName}
                      onChange={(event) => {
                        setNewBrandName(event.target.value);
                        clearApprovalFieldError("newBrandName");
                      }}
                    />
                    <CandidateFieldError
                      errors={approvalFieldErrors}
                      field="newBrandName"
                    />
                  </div>
                  <div>
                    <label
                      className="text-sm font-medium"
                      htmlFor="candidate-new-brand-slug"
                    >
                      Brand slug <RequiredMark />
                    </label>
                    <input
                      aria-describedby={
                        approvalFieldErrors.newBrandSlug
                          ? "candidate-review-error-newBrandSlug"
                          : undefined
                      }
                      aria-invalid={Boolean(approvalFieldErrors.newBrandSlug)}
                      aria-required="true"
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      id="candidate-new-brand-slug"
                      placeholder="Enter brand slug"
                      value={newBrandSlug}
                      onChange={(event) => {
                        setNewBrandSlug(event.target.value);
                        clearApprovalFieldError("newBrandSlug");
                      }}
                    />
                    <CandidateFieldError
                      errors={approvalFieldErrors}
                      field="newBrandSlug"
                    />
                  </div>
                </div>
              )}
            </fieldset>

            <fieldset className="mt-6 rounded-md border border-border p-4">
              <legend className="px-1 text-sm font-semibold">
                Store / Location
              </legend>
              <p className="mt-1 text-sm text-muted-foreground">
                The physical branch created under the selected brand. Store
                coordinates are required for maps and geographic discovery.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    className="text-sm font-medium"
                    htmlFor="candidate-location-name"
                  >
                    Location display name <RequiredMark />
                  </label>
                  <input
                    aria-describedby={
                      approvalFieldErrors.displayName
                        ? "candidate-review-error-displayName"
                        : undefined
                    }
                    aria-invalid={Boolean(approvalFieldErrors.displayName)}
                    aria-required="true"
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    id="candidate-location-name"
                    placeholder="Enter location display name"
                    value={displayName}
                    onChange={(event) => {
                      setDisplayName(event.target.value);
                      clearApprovalFieldError("displayName");
                    }}
                  />
                  <CandidateFieldError
                    errors={approvalFieldErrors}
                    field="displayName"
                  />
                </div>
                <div>
                  <label
                    className="text-sm font-medium"
                    htmlFor="candidate-location-slug"
                  >
                    Location slug <RequiredMark />
                  </label>
                  <input
                    aria-describedby={
                      approvalFieldErrors.locationSlug
                        ? "candidate-review-error-locationSlug"
                        : undefined
                    }
                    aria-invalid={Boolean(approvalFieldErrors.locationSlug)}
                    aria-required="true"
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    id="candidate-location-slug"
                    placeholder="Enter location slug"
                    value={locationSlug}
                    onChange={(event) => {
                      setLocationSlug(event.target.value);
                      clearApprovalFieldError("locationSlug");
                    }}
                  />
                  <CandidateFieldError
                    errors={approvalFieldErrors}
                    field="locationSlug"
                  />
                </div>
                <div>
                  <label
                    className="text-sm font-medium"
                    htmlFor="candidate-suburb"
                  >
                    Suburb / area <RequiredMark />
                  </label>
                  <input
                    aria-describedby={
                      approvalFieldErrors.suburb
                        ? "candidate-review-error-suburb"
                        : undefined
                    }
                    aria-invalid={Boolean(approvalFieldErrors.suburb)}
                    aria-required="true"
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    id="candidate-suburb"
                    placeholder="Enter suburb or area"
                    value={suburb}
                    onChange={(event) => {
                      setSuburb(event.target.value);
                      clearApprovalFieldError("suburb");
                    }}
                  />
                  <CandidateFieldError
                    errors={approvalFieldErrors}
                    field="suburb"
                  />
                </div>
                <div>
                  <label
                    className="text-sm font-medium"
                    htmlFor="candidate-address"
                  >
                    Address <RequiredMark />
                  </label>
                  <input
                    aria-describedby={
                      approvalFieldErrors.address
                        ? "candidate-review-error-address"
                        : undefined
                    }
                    aria-invalid={Boolean(approvalFieldErrors.address)}
                    aria-required="true"
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    id="candidate-address"
                    placeholder="Enter verified street address"
                    value={address}
                    onChange={(event) => {
                      setAddress(event.target.value);
                      clearApprovalFieldError("address");
                    }}
                  />
                  <CandidateFieldError
                    errors={approvalFieldErrors}
                    field="address"
                  />
                </div>
                <div>
                  <label
                    className="text-sm font-medium"
                    htmlFor="candidate-latitude"
                  >
                    Latitude <RequiredMark />
                  </label>
                  <input
                    aria-describedby={
                      approvalFieldErrors.latitude
                        ? "candidate-review-error-latitude"
                        : undefined
                    }
                    aria-invalid={Boolean(approvalFieldErrors.latitude)}
                    aria-required="true"
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    id="candidate-latitude"
                    inputMode="decimal"
                    placeholder="Enter latitude"
                    value={latitude}
                    onChange={(event) => {
                      setLatitude(event.target.value);
                      clearApprovalFieldError("latitude");
                    }}
                  />
                  <CandidateFieldError
                    errors={approvalFieldErrors}
                    field="latitude"
                  />
                </div>
                <div>
                  <label
                    className="text-sm font-medium"
                    htmlFor="candidate-longitude"
                  >
                    Longitude <RequiredMark />
                  </label>
                  <input
                    aria-describedby={
                      approvalFieldErrors.longitude
                        ? "candidate-review-error-longitude"
                        : undefined
                    }
                    aria-invalid={Boolean(approvalFieldErrors.longitude)}
                    aria-required="true"
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    id="candidate-longitude"
                    inputMode="decimal"
                    placeholder="Enter longitude"
                    value={longitude}
                    onChange={(event) => {
                      setLongitude(event.target.value);
                      clearApprovalFieldError("longitude");
                    }}
                  />
                  <CandidateFieldError
                    errors={approvalFieldErrors}
                    field="longitude"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label
                    className="text-sm font-medium"
                    htmlFor="candidate-source-reference"
                  >
                    Independent verification URL
                  </label>
                  <input
                    aria-describedby={
                      approvalFieldErrors.sourceReference
                        ? "candidate-review-error-sourceReference"
                        : undefined
                    }
                    aria-invalid={Boolean(approvalFieldErrors.sourceReference)}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    id="candidate-source-reference"
                    placeholder="Enter verification URL (optional)"
                    value={sourceReference}
                    onChange={(event) => {
                      setSourceReference(event.target.value);
                      clearApprovalFieldError("sourceReference");
                    }}
                  />
                  <CandidateFieldError
                    errors={approvalFieldErrors}
                    field="sourceReference"
                  />
                </div>
              </div>
            </fieldset>
            <button
              className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Creating store…" : "Approve and create store"}
            </button>
          </form>

          <section className="mt-8 rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">
              Merge with existing location
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Use only when this candidate is already represented by a canonical
              location.
            </p>
            {candidate.possible_location_id ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Discovery suggested canonical location ID:{" "}
                <span className="font-mono text-xs">
                  {candidate.possible_location_id}
                </span>
              </p>
            ) : null}
            <input
              aria-label="Search canonical locations"
              className="mt-4 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Search locations"
              value={mergeSearch}
              onChange={(event) => setMergeSearch(event.target.value)}
            />
            <select
              className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={targetLocationId}
              onChange={(event) => setTargetLocationId(event.target.value)}
            >
              <option value="">Select a canonical location</option>
              {matchingLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.display_name} — {location.suburb} (
                  {location.publication_status})
                </option>
              ))}
            </select>
            <button
              className="mt-4 rounded-md border border-border px-4 py-2 text-sm font-medium disabled:opacity-60"
              disabled={isSubmitting || !targetLocationId}
              type="button"
              onClick={merge}
            >
              Merge with existing location
            </button>
          </section>

          <section className="mt-8 rounded-lg border border-destructive/30 bg-card p-5">
            <h2 className="text-lg font-semibold">Reject candidate</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The candidate and discovery history remain preserved.
            </p>
            <select
              className="mt-4 w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
            >
              {rejectionReasons.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button
              className="mt-4 block rounded-md border border-destructive px-4 py-2 text-sm font-medium text-destructive disabled:opacity-60"
              disabled={isSubmitting}
              type="button"
              onClick={reject}
            >
              Reject candidate
            </button>
          </section>
        </>
      ) : (
        <section className="mt-8 rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">Review complete</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Reviewed {formatDate(candidate.reviewed_at)}. Canonical location:{" "}
            <span className="font-mono text-xs">
              {candidate.resolved_location_id ?? "none"}
            </span>
            {candidate.rejection_reason
              ? ` · Reason: ${candidate.rejection_reason.replaceAll("_", " ")}`
              : ""}
          </p>
        </section>
      )}
    </section>
  );
}
