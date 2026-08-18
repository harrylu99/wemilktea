import { expect, test } from "bun:test";
import {
  createConfirmMenuHandler,
  type ConfirmMenuEnvironment,
  type ConfirmMenuRequest
} from "./handler.ts";
import {
  ConfirmMenuRepositoryError,
  type ConfirmMenuRepository
} from "./repository.ts";

const environment: ConfirmMenuEnvironment = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_ANON_KEY: "test-anon-key",
  ADMIN_APP_ORIGIN: "https://admin.example.test"
};

const locationId = "11111111-1111-4111-8111-111111111111";
const categoryId = "22222222-2222-4222-8222-222222222222";
const productId = "33333333-3333-4333-8333-333333333333";

const item = {
  externalItemId: "uber-item-1",
  name: "Taro Milk Tea",
  description: "Reviewed description",
  targetCategoryId: categoryId
};

function request(body: unknown, origin = environment.ADMIN_APP_ORIGIN) {
  return new Request("https://function.example.test/confirm-menu-import", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

function validRequest(): ConfirmMenuRequest {
  return { locationId, provider: "uber_eats", items: [item] };
}

function repository(
  result: unknown = {
    status: "success",
    created: [
      { externalItemId: item.externalItemId, name: item.name, productId }
    ],
    reused: [],
    failed: []
  }
): ConfirmMenuRepository {
  return {
    async confirmImport(input) {
      expect(input).toEqual(validRequest());
      return result;
    }
  };
}

test("rejects malformed confirmation requests before the write repository", async () => {
  let calls = 0;
  const response = await createConfirmMenuHandler(environment, {
    authorizeAdmin: async () => {
      throw new Error("authorization should not run");
    },
    repository: {
      async confirmImport() {
        calls += 1;
        return null;
      }
    }
  })(
    request({ ...validRequest(), items: [{ ...item, targetCategoryId: "no" }] })
  );

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "Invalid import request." });
  expect(calls).toBe(0);
});

test("enforces the existing 401 and 403 Admin boundary", async () => {
  const unauthorized = await createConfirmMenuHandler(environment, {
    authorizeAdmin: async (_request, _environment, headers) =>
      new Response(JSON.stringify({ error: "Authentication is required." }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...headers }
      }),
    repository: repository()
  })(request(validRequest()));
  expect(unauthorized.status).toBe(401);

  const forbidden = await createConfirmMenuHandler(environment, {
    authorizeAdmin: async (_request, _environment, headers) =>
      new Response(
        JSON.stringify({ error: "Administrator access is required." }),
        {
          status: 403,
          headers: { "Content-Type": "application/json", ...headers }
        }
      ),
    repository: repository()
  })(request(validRequest()));
  expect(forbidden.status).toBe(403);
});

test("returns the structured draft import result for an Admin", async () => {
  const response = await createConfirmMenuHandler(environment, {
    authorizeAdmin: async () => ({ client: {} as never, userId: "admin-1" }),
    repository: repository()
  })(request(validRequest()));

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    status: "success",
    created: [
      { externalItemId: item.externalItemId, name: item.name, productId }
    ],
    reused: [],
    failed: []
  });
});

test("returns item-level validation failures without pretending to write", async () => {
  const response = await createConfirmMenuHandler(environment, {
    authorizeAdmin: async () => ({ client: {} as never, userId: "admin-1" }),
    repository: repository({
      status: "validation_failed",
      created: [],
      reused: [],
      failed: [
        {
          externalItemId: item.externalItemId,
          reason: "Possible existing product requires manual resolution."
        }
      ]
    })
  })(request(validRequest()));

  expect(response.status).toBe(200);
  expect((await response.json()).failed).toEqual([
    {
      externalItemId: item.externalItemId,
      reason: "Possible existing product requires manual resolution."
    }
  ]);
});

test("maps an external identity conflict to a safe retry response", async () => {
  const response = await createConfirmMenuHandler(environment, {
    authorizeAdmin: async () => ({ client: {} as never, userId: "admin-1" }),
    repository: {
      async confirmImport() {
        throw new ConfirmMenuRepositoryError("external_identity_conflict");
      }
    }
  })(request(validRequest()));

  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    error:
      "An external item changed while it was being reviewed. Refresh the menu and retry."
  });
});

test("rejects a disallowed origin without invoking authorization", async () => {
  let authorized = false;
  const response = await createConfirmMenuHandler(environment, {
    authorizeAdmin: async () => {
      authorized = true;
      return { client: {} as never, userId: "admin-1" };
    },
    repository: repository()
  })(request(validRequest(), "https://evil.example.test"));

  expect(response.status).toBe(403);
  expect(authorized).toBeFalse();
});
