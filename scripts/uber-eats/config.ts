export type Environment = Record<string, string | undefined>;
export type UberEnvironment = "sandbox" | "production";

export interface UberEndpoints {
  authBaseUrl: string;
  apiBaseUrl: string;
}

export const UBER_ENVIRONMENT_ENDPOINTS: Record<
  UberEnvironment,
  UberEndpoints
> = {
  sandbox: {
    authBaseUrl: "https://sandbox-login.uber.com",
    apiBaseUrl: "https://test-api.uber.com"
  },
  production: {
    authBaseUrl: "https://auth.uber.com",
    apiBaseUrl: "https://api.uber.com"
  }
};

export class UberConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UberConfigurationError";
  }
}

export function resolveUberEnvironment(env: Environment): UberEnvironment {
  const value = env.UBER_EATS_ENV?.trim().toLowerCase();

  if (!value) {
    throw new UberConfigurationError(
      "UBER_EATS_ENV is required; set it to sandbox or production"
    );
  }

  if (value !== "sandbox" && value !== "production") {
    throw new UberConfigurationError(
      "UBER_EATS_ENV must be sandbox or production"
    );
  }

  return value;
}

export function resolveUberEndpoints(
  environment: UberEnvironment
): UberEndpoints {
  return UBER_ENVIRONMENT_ENDPOINTS[environment];
}
