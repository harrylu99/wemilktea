import {
  approveStoreCandidateSchema,
  type ApproveStoreCandidateInput
} from "@wemilktea/validation";

export type CandidateApprovalField =
  | "brand"
  | "newBrandName"
  | "newBrandSlug"
  | "displayName"
  | "locationSlug"
  | "suburb"
  | "address"
  | "latitude"
  | "longitude"
  | "sourceReference";

export type CandidateApprovalFormValues = {
  candidateId: string;
  brandMode: "existing" | "new";
  selectedBrandId: string;
  newBrandName: string;
  newBrandSlug: string;
  displayName: string;
  locationSlug: string;
  suburb: string;
  address: string;
  latitude: string;
  longitude: string;
  sourceReference: string;
};

export type CandidateApprovalFieldErrors = Partial<
  Record<CandidateApprovalField, string>
>;

export type CandidateApprovalValidation = {
  input: ApproveStoreCandidateInput | null;
  errors: CandidateApprovalFieldErrors;
};

function setError(
  errors: CandidateApprovalFieldErrors,
  field: CandidateApprovalField,
  message: string
) {
  if (!errors[field]) errors[field] = message;
}

function parseCoordinate(
  value: string,
  field: "latitude" | "longitude",
  label: string,
  minimum: number,
  maximum: number,
  errors: CandidateApprovalFieldErrors
) {
  const trimmed = value.trim();

  // Check for an empty value before Number(). Number("") is 0, which is a
  // valid coordinate and would incorrectly allow an incomplete form through.
  if (!trimmed) {
    setError(errors, field, `${label} is required.`);
    return undefined;
  }

  const numericValue = Number(trimmed);
  if (
    !Number.isFinite(numericValue) ||
    numericValue < minimum ||
    numericValue > maximum
  ) {
    setError(errors, field, `${label} is invalid.`);
    return undefined;
  }

  return numericValue;
}

function fieldForIssuePath(path: PropertyKey[]): CandidateApprovalField | null {
  const pathString = path.join(".");

  switch (pathString) {
    case "brand.brandId":
      return "brand";
    case "brand.name":
      return "newBrandName";
    case "brand.slug":
      return "newBrandSlug";
    case "location.displayName":
      return "displayName";
    case "location.slug":
      return "locationSlug";
    case "location.suburb":
      return "suburb";
    case "location.address":
      return "address";
    case "location.sourceReference":
      return "sourceReference";
    default:
      return null;
  }
}

export function validateCandidateApprovalForm(
  values: CandidateApprovalFormValues
): CandidateApprovalValidation {
  const errors: CandidateApprovalFieldErrors = {};

  if (values.brandMode === "existing" && !values.selectedBrandId.trim()) {
    setError(errors, "brand", "Brand is required.");
  }
  if (values.brandMode === "new" && !values.newBrandName.trim()) {
    setError(errors, "newBrandName", "Brand name is required.");
  }
  if (values.brandMode === "new" && !values.newBrandSlug.trim()) {
    setError(errors, "newBrandSlug", "Brand slug is required.");
  }
  if (!values.displayName.trim()) {
    setError(errors, "displayName", "Location name is required.");
  }
  if (!values.locationSlug.trim()) {
    setError(errors, "locationSlug", "Location slug is required.");
  }
  if (!values.suburb.trim()) {
    setError(errors, "suburb", "Suburb / area is required.");
  }
  if (!values.address.trim()) {
    setError(errors, "address", "Address is required.");
  }

  const latitude = parseCoordinate(
    values.latitude,
    "latitude",
    "Latitude",
    -90,
    90,
    errors
  );
  const longitude = parseCoordinate(
    values.longitude,
    "longitude",
    "Longitude",
    -180,
    180,
    errors
  );

  const parsed = approveStoreCandidateSchema.safeParse({
    candidateId: values.candidateId,
    brand:
      values.brandMode === "existing"
        ? { mode: "existing", brandId: values.selectedBrandId }
        : {
            mode: "new",
            name: values.newBrandName,
            slug: values.newBrandSlug
          },
    location: {
      displayName: values.displayName,
      slug: values.locationSlug,
      suburb: values.suburb,
      address: values.address,
      // NaN keeps the shared number schema authoritative when the user typed
      // a non-numeric value, while empty values already have a required error.
      latitude: latitude ?? Number.NaN,
      longitude: longitude ?? Number.NaN,
      ...(values.sourceReference.trim()
        ? { sourceReference: values.sourceReference }
        : {})
    }
  });

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = fieldForIssuePath(issue.path);
      if (!field) continue;

      const message =
        field === "newBrandSlug"
          ? "Brand slug is invalid."
          : field === "locationSlug"
            ? "Location slug is invalid."
            : field === "sourceReference"
              ? "Independent verification URL is invalid."
              : field === "brand"
                ? "Select a valid brand."
                : issue.message;
      setError(errors, field, message);
    }
  }

  return {
    input:
      parsed.success && Object.keys(errors).length === 0 ? parsed.data : null,
    errors
  };
}
