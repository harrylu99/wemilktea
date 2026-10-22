export type KeepaliveEnv = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
};

// A brand slug that never matches keeps the response tiny while still running
// a real database query, which is what counts as project activity.
const keepaliveBody = JSON.stringify({ p_brand_slug: "__keepalive__" });

export async function pingSupabase(
  env: KeepaliveEnv,
  fetcher: typeof fetch = fetch
): Promise<number> {
  const url = new URL("/rest/v1/rpc/search_public_stores", env.SUPABASE_URL);
  const response = await fetcher(url, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      "content-type": "application/json"
    },
    body: keepaliveBody
  });
  await response.body?.cancel();
  if (!response.ok) {
    // Throwing marks the cron invocation as failed in Cloudflare's dashboard.
    throw new Error(`Supabase keep-alive failed with HTTP ${response.status}`);
  }
  return response.status;
}

export default {
  // Awaited rather than passed to waitUntil so a failed ping fails the
  // invocation and shows up as an error in Cron Events.
  async scheduled(_controller: unknown, env: KeepaliveEnv) {
    await pingSupabase(env);
  }
};
