import { expect, mock, test } from "bun:test";
import { signInAdmin } from "./auth-login";

const signInWithPassword = mock(async (credentials: unknown) => ({
  data: { session: null, user: null },
  error: null,
  credentials
}));
const client = { auth: { signInWithPassword } } as never;

test("passes the Turnstile token to Admin password sign-in", async () => {
  const result = await signInAdmin(
    client,
    "admin@example.com",
    "password",
    async () => "admin-turnstile-token"
  );

  expect(result.error).toBeNull();
  expect(signInWithPassword).toHaveBeenCalledWith({
    email: "admin@example.com",
    password: "password",
    options: { captchaToken: "admin-turnstile-token" }
  });
});

test("fails closed without attempting Admin sign-in when Turnstile fails", async () => {
  signInWithPassword.mockClear();

  const result = await signInAdmin(
    client,
    "admin@example.com",
    "password",
    async () => {
      throw new Error("turnstile_failed");
    }
  );

  expect(result.error?.message).toBe("captcha_unavailable");
  expect(signInWithPassword).not.toHaveBeenCalled();
});
