import { createClient } from "@supabase/supabase-js";
import { browserEnvironmentSchema } from "@wemilktea/validation";

const environment = browserEnvironmentSchema.safeParse(import.meta.env);

const supabaseUrl = environment.success
  ? environment.data.VITE_SUPABASE_URL
  : undefined;
const supabaseAnonKey = environment.success
  ? environment.data.VITE_SUPABASE_ANON_KEY
  : undefined;

export const supabaseConfigurationError =
  supabaseUrl && supabaseAnonKey
    ? null
    : "The admin application is missing valid Supabase browser configuration.";

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false
        }
      })
    : null;
