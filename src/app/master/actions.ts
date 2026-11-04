"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

export async function signOutMaster() {
  const client = await createServerSupabase();
  if (client) await client.auth.signOut();
  redirect("/login");
}
