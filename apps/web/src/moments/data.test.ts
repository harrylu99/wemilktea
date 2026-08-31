import { expect, test } from "bun:test";
import {
  loadPublicMomentsPage,
  normalizePublicMoment,
  MOMENTS_PAGE_SIZE
} from "./data";

const firstRow = {
  id: "11111111-1111-4111-8111-111111111111",
  image_asset_id: "22222222-2222-4222-8222-222222222222",
  storage_key: "community/user/post/image.webp",
  content_type: "image/webp",
  width: 1200,
  height: 900,
  caption: "A bright afternoon cup",
  display_name: "Harry",
  location_id: "33333333-3333-4333-8333-333333333333",
  location_text: null,
  location_name: "Mellow Tea House",
  location_slug: "mellow-tea-house",
  product_id: "44444444-4444-4444-8444-444444444444",
  product_text: null,
  product_name: "Matcha Cloud Latte",
  product_slug: "matcha-cloud-latte",
  product_brand_slug: "gong-cha",
  created_at: "2026-08-31T00:00:00.000Z",
  submitted_at: "2026-08-31T00:00:00.000Z",
  like_count: 3,
  liked_by_me: false,
  must_try_by_me: false
};

function makeRow(index: number) {
  return {
    ...firstRow,
    id: `${String(index).padStart(8, "0")}-1111-4111-8111-111111111111`,
    submitted_at: `2026-08-${String(31 - Math.floor(index / 2)).padStart(2, "0")}T${String(index % 24).padStart(2, "0")}:00:00.000Z`
  };
}

test("normalizes canonical and free-text Moment metadata without inventing links", () => {
  const moment = normalizePublicMoment(
    {
      ...firstRow,
      location_id: null,
      location_name: null,
      location_slug: null,
      location_text: "New tea shop in Takapuna",
      product_id: null,
      product_name: null,
      product_slug: null,
      product_text: "A surprise jasmine drink"
    },
    "https://images.example.test"
  );

  expect(moment).toMatchObject({
    imageUrl: "https://images.example.test/community/user/post/image.webp",
    location: {
      id: null,
      name: null,
      text: "New tea shop in Takapuna"
    },
    product: {
      id: null,
      name: null,
      text: "A surprise jasmine drink"
    }
  });
});

test("keeps a valid dimensionless image in the public feed", async () => {
  const client = {
    rpc: async () => ({
      data: [{ ...firstRow, width: null, height: null }],
      error: null
    })
  } as unknown as NonNullable<Parameters<typeof loadPublicMomentsPage>[1]>;

  const result = await loadPublicMomentsPage(null, client);

  expect(result.error).toBeNull();
  expect(result.data).toHaveLength(1);
  expect(result.data?.[0]).toMatchObject({ width: null, height: null });
});

test("skips a malformed row without dropping valid Moments", async () => {
  const client = {
    rpc: async () => ({
      data: [
        firstRow,
        { ...firstRow, caption: null },
        { ...firstRow, id: "55555555-5555-4555-8555-555555555555" }
      ],
      error: null
    })
  } as unknown as NonNullable<Parameters<typeof loadPublicMomentsPage>[1]>;

  const result = await loadPublicMomentsPage(null, client);

  expect(result.error).toBeNull();
  expect(result.data?.map((moment) => moment.id)).toEqual([
    firstRow.id,
    "55555555-5555-4555-8555-555555555555"
  ]);
});

test("advances the cursor past an invalid trailing row", async () => {
  const trailingRow = {
    ...makeRow(MOMENTS_PAGE_SIZE),
    caption: null
  };
  const rows = [
    ...Array.from({ length: MOMENTS_PAGE_SIZE - 1 }, (_, index) =>
      makeRow(index + 1)
    ),
    trailingRow
  ];
  const client = {
    rpc: async () => ({ data: rows, error: null })
  } as unknown as NonNullable<Parameters<typeof loadPublicMomentsPage>[1]>;

  const result = await loadPublicMomentsPage(null, client);

  expect(result.data).toHaveLength(MOMENTS_PAGE_SIZE - 1);
  expect(result.nextCursor).toEqual({
    id: trailingRow.id,
    submittedAt: trailingRow.submitted_at
  });
  expect(result.hasMore).toBe(false);
});

test("reports a malformed cursor row instead of ending pagination", async () => {
  const malformedCursorRow = {
    ...makeRow(MOMENTS_PAGE_SIZE),
    id: "not-a-uuid"
  };
  const rows = [
    ...Array.from({ length: MOMENTS_PAGE_SIZE - 1 }, (_, index) =>
      makeRow(index + 1)
    ),
    malformedCursorRow,
    makeRow(MOMENTS_PAGE_SIZE + 1)
  ];
  const client = {
    rpc: async () => ({ data: rows, error: null })
  } as unknown as NonNullable<Parameters<typeof loadPublicMomentsPage>[1]>;

  const result = await loadPublicMomentsPage(null, client);

  expect(result).toEqual({
    data: null,
    nextCursor: null,
    hasMore: false,
    error: "invalid_data"
  });
});

test("requests one look-ahead row and advances the submitted_at/id cursor", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rows = Array.from({ length: MOMENTS_PAGE_SIZE + 1 }, (_, index) =>
    makeRow(index + 1)
  );
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return { data: rows, error: null };
    }
  } as unknown as NonNullable<Parameters<typeof loadPublicMomentsPage>[1]>;

  const result = await loadPublicMomentsPage(null, client);

  expect(calls).toEqual([
    {
      name: "list_public_community_posts",
      args: {
        p_before_id: null,
        p_before_submitted_at: null,
        p_limit: MOMENTS_PAGE_SIZE + 1
      }
    }
  ]);
  expect(result.error).toBeNull();
  expect(result.data).toHaveLength(MOMENTS_PAGE_SIZE);
  expect(result.hasMore).toBe(true);
  expect(result.nextCursor).toEqual({
    id: makeRow(MOMENTS_PAGE_SIZE).id,
    submittedAt: makeRow(MOMENTS_PAGE_SIZE).submitted_at
  });
});

test("reports a malformed RPC payload without rendering partial data", async () => {
  const client = {
    rpc: async () => ({ data: { id: firstRow.id }, error: null })
  } as unknown as NonNullable<Parameters<typeof loadPublicMomentsPage>[1]>;

  const result = await loadPublicMomentsPage(null, client);

  expect(result).toEqual({
    data: null,
    error: "invalid_data",
    hasMore: false,
    nextCursor: null
  });
});
