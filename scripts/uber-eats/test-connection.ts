import {
  loadUberConfig,
  requestApplicationToken,
  UberConfigurationError,
  UberOAuthError
} from "./auth";
import {
  listAuthorizedStores,
  retrieveMenu,
  retrieveStoreDetails,
  summarizeMenu,
  UberApiError
} from "./client";
import type { Fetcher } from "./auth";

const EXPECTED_STORE_ID = "bff943ba-f5d8-4773-9699-f2109743369c";

function printError(error: unknown): void {
  if (error instanceof UberOAuthError) {
    console.error(`OAuth result: failed (HTTP ${error.status})`);
    console.error(`OAuth stage: token`);
    console.error(`Uber error: ${error.code} — ${error.message}`);
    return;
  }

  if (error instanceof UberApiError) {
    console.error(`${error.stage} result: failed (HTTP ${error.status})`);
    console.error(`Uber error: ${error.code} — ${error.message}`);
    console.error(
      `Uber-side blocker: ${error.stage} request was rejected by Uber`
    );
    return;
  }

  if (error instanceof UberConfigurationError) {
    console.error(`Configuration error: ${error.message}`);
    return;
  }

  console.error("Unexpected failure while running the Uber Eats sandbox spike");
}

export async function runConnection(
  env: Record<string, string | undefined> = process.env,
  fetcher: Fetcher = (input, init) => fetch(input, init)
): Promise<number> {
  let config;
  try {
    config = loadUberConfig(env);
  } catch (error) {
    printError(error);
    return 1;
  }

  console.log(`Auth host: ${new URL(config.authBaseUrl).host}`);
  console.log(`API host: ${new URL(config.apiBaseUrl).host}`);

  let token;
  try {
    token = await requestApplicationToken(config, fetcher);
  } catch (error) {
    printError(error);
    return 2;
  }

  console.log("OAuth result: succeeded");
  console.log(
    `Granted/usable scope: ${token.scope || "(not returned; requested eats.store)"}`
  );
  console.log(`Token lifetime: ${token.expiresIn} seconds`);

  let stores;
  try {
    stores = await listAuthorizedStores(
      token.accessToken,
      config.apiBaseUrl,
      fetcher
    );
  } catch (error) {
    printError(error);
    return 3;
  }

  console.log("Store enumeration result: succeeded");
  console.log(`Number of authorised/test stores: ${stores.length}`);
  for (const store of stores) {
    console.log(`- ${store.storeId}: ${store.name}`);
  }

  const expectedStore = stores.find(
    (store) => store.storeId === EXPECTED_STORE_ID
  );
  console.log(
    `Expected test store found in authorized list: ${expectedStore ? "yes" : "no"}`
  );

  let storeForMenu = expectedStore;
  if (!storeForMenu) {
    try {
      const details = await retrieveStoreDetails(
        EXPECTED_STORE_ID,
        token.accessToken,
        config.apiBaseUrl,
        fetcher
      );
      console.log("Direct Store Details result: succeeded");
      console.log(`- ${details.storeId}: ${details.name}`);
      console.log(`Store status: ${details.status}`);
      console.log(
        `Store location city: ${details.location.city ?? "(not returned)"}`
      );
      storeForMenu = { storeId: details.storeId, name: details.name };
    } catch (error) {
      printError(error);
      console.log(
        "Uber-side blocker: the provisioned test store is not authorized in the collection and direct Store Details access failed."
      );
      console.log("Menu retrieval result: not attempted");
      return 4;
    }
  } else {
    try {
      const details = await retrieveStoreDetails(
        storeForMenu.storeId,
        token.accessToken,
        config.apiBaseUrl,
        fetcher
      );
      console.log("Store Details result: succeeded");
      console.log(`- ${details.storeId}: ${details.name}`);
      console.log(`Store status: ${details.status}`);
      console.log(
        `Store location city: ${details.location.city ?? "(not returned)"}`
      );
    } catch (error) {
      printError(error);
      console.log("Menu retrieval result: not attempted");
      return 4;
    }
  }

  if (!storeForMenu) {
    console.log(
      "Uber-side blocker: no authorized store is available for menu retrieval."
    );
    console.log("Menu retrieval result: not attempted");
    return 4;
  }

  try {
    const menu = await retrieveMenu(
      storeForMenu.storeId,
      token.accessToken,
      config.apiBaseUrl,
      fetcher
    );
    const summary = summarizeMenu(menu);
    console.log(
      `Menu retrieval result: succeeded for store ${storeForMenu.storeId}`
    );
    console.log(
      `High-level menu payload shape found: root keys ${summary.rootKeys.join(", ")}`
    );
    console.log(`Menu entity counts: ${JSON.stringify(summary.counts)}`);
    console.log(
      `Sanitized menu structure: ${JSON.stringify(summary.structure)}`
    );
    console.log(
      "Sanitized menu structure: scripts/uber-eats/samples/menu-structure.json"
    );
  } catch (error) {
    printError(error);
    return 5;
  }

  return 0;
}

if (import.meta.main) {
  const exitCode = await runConnection();
  process.exitCode = exitCode;
}
