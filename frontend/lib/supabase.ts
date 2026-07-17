import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const url = env?.VITE_SUPABASE_URL;
const key = env?.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase: SupabaseClient | null = url && key && !url.includes("YOUR_PROJECT_REF")
  ? createClient(url, key)
  : null;
