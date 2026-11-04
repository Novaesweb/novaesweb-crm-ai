import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "./config";

export async function createServerSupabase() {
  const config = getSupabasePublicConfig();
  if (!config) return null;
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Rendering Server Components cannot update cookies; authenticated mutations
          // must use Server Actions / Route Handlers and dedicated session refresh.
        }
      },
    },
  });
}
