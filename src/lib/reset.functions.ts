import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function sha256(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

const Email = z.string().trim().toLowerCase().email().max(255);

export const requestReset = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email: Email }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: uid } = await supabaseAdmin.rpc("user_id_by_email", { _email: data.email });
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const token = Array.from(bytes).map((x) => x.toString(16).padStart(2, "0")).join("");
    const { error } = await supabaseAdmin.from("password_resets").insert({
      email: data.email, user_id: (uid as string | null) ?? null, token_hash: await sha256(token),
    });
    if (error) throw new Error("Demande impossible");
    return { token };
  });

export const checkReset = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email: Email, token: z.string().min(10).max(64) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("password_resets").select("status, used_at")
      .eq("email", data.email).eq("token_hash", await sha256(data.token)).maybeSingle();
    if (!row) return { status: "unknown" as const };
    if (row.used_at) return { status: "used" as const };
    return { status: row.status as "pending" | "approved" | "rejected" };
  });

export const completeReset = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    email: Email, token: z.string().min(10).max(64),
    password: z.string().regex(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,72}$/),
  }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("password_resets").select("*")
      .eq("email", data.email).eq("token_hash", await sha256(data.token)).maybeSingle();
    if (!row || row.status !== "approved" || row.used_at || !row.user_id) throw new Error("Demande non approuvée");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(row.user_id, { password: data.password });
    if (error) throw new Error("Échec");
    await supabaseAdmin.from("password_resets").update({ used_at: new Date().toISOString() }).eq("id", row.id);
    return { ok: true };
  });
