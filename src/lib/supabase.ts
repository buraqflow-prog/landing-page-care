import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * External, self-managed Supabase connection. Replace the VITE_ values in
 * your deployment environment with the project URL and anon key.
 */
const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"] ?? "YOUR_SUPABASE_URL";
const supabaseAnonKey = import.meta.env["VITE_SUPABASE_ANON_KEY"] ?? "YOUR_SUPABASE_ANON_KEY";
const hasExternalCredentials =
  supabaseUrl !== "YOUR_SUPABASE_URL" && supabaseAnonKey !== "YOUR_SUPABASE_ANON_KEY";

export const supabase: SupabaseClient | null = hasExternalCredentials
  ? createClient(supabaseUrl, supabaseAnonKey, {
      realtime: { params: { eventsPerSecond: 20 } },
    })
  : null;

export const isSupabaseConfigured = supabase !== null;