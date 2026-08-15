import { expect, test } from "bun:test";
import {
  validateCandidateApprovalForm,
  type CandidateApprovalFormValues
} from "./candidate-review-form";

const baseValues: CandidateApprovalFormValues = {
  candidateId: "c1af35e6-e2d2-490f-82ca-2137b8f106d4",
  brandMode: "existing",
  selectedBrandId: "4b75bfe1-f502-4c41-ad08-4b4d9b16bfc2",
  newBrandName: "",
  newBrandSlug: "",
  displayName: "Tea House Central",
  locationSlug: "tea-house-central",
  suburb: "Auckland CBD",
  address: "1 Queen Street, Auckland",
  latitude: "-36.8485",
  longitude: "174.7633",
  sourceReference: "https://example.com/stores/central"
};

test("requires coordinates instead of coercing empty values to zero", () => {
  const result = validateCandidateApprovalForm({
    ...baseValues,
    latitude: "",
    longitude: ""
  });

  expect(result.input).toBeNull();
  expect(result.errors.latitude).toBe("Latitude is required.");
  expect(result.errors.longitude).toBe("Longitude is required.");
});

test("reports field-specific errors for brand and location data", () => {
  const result = validateCandidateApprovalForm({
    ...baseValues,
    selectedBrandId: "",
    displayName: " ",
    locationSlug: "not a slug",
    address: "",
    latitude: "north",
    longitude: "181"
  });

  expect(result.input).toBeNull();
  expect(result.errors).toMatchObject({
    brand: "Brand is required.",
    displayName: "Location name is required.",
    locationSlug: "Location slug is invalid.",
    address: "Address is required.",
    latitude: "Latitude is invalid.",
    longitude: "Longitude is invalid."
  });
});

test("returns the shared approval input for valid existing-brand data", () => {
  const result = validateCandidateApprovalForm(baseValues);

  expect(result.errors).toEqual({});
  expect(result.input).toMatchObject({
    candidateId: baseValues.candidateId,
    brand: { mode: "existing", brandId: baseValues.selectedBrandId },
    location: {
      latitude: -36.8485,
      longitude: 174.7633
    }
  });
});

test("validates new-brand fields without requiring coordinates on the brand", () => {
  const result = validateCandidateApprovalForm({
    ...baseValues,
    brandMode: "new",
    selectedBrandId: "",
    newBrandName: "Tea House",
    newBrandSlug: "tea-house"
  });

  expect(result.errors).toEqual({});
  expect(result.input?.brand).toEqual({
    mode: "new",
    name: "Tea House",
    slug: "tea-house"
  });
});
