import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://p2p-social.vercel.app",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Vary": "Origin",
};
const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function reply(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
function claimsFrom(token: string) {
  try {
    const part = token.split(".")[1];
    let encoded = part.replace(/-/g, "+").replace(/_/g, "/");
    encoded += "=".repeat((4 - encoded.length % 4) % 4);
    return JSON.parse(atob(encoded));
  } catch { return {}; }
}
async function logAction(admin: ReturnType<typeof createClient>, actorId: string, action: string, targetType: string | null, targetId: string | null, details: Record<string, unknown> = {}) {
  const { error } = await admin.from("admin_audit_logs").insert({
    actor_id: actorId, action, target_type: targetType, target_id: targetId, details,
  });
  if (error) throw error;
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!["GET", "POST"].includes(req.method)) return reply({ error: "Method not allowed" }, 405);
  const origin = req.headers.get("Origin");
  if (origin && origin !== "https://p2p-social.vercel.app") return reply({ error: "Origin not allowed" }, 403);
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return reply({ error: "Unauthorized" }, 401);

  try {
    const userClient = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return reply({ error: "Invalid session" }, 401);

    const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: profile, error: profileError } = await admin.from("profiles")
      .select("username,role,is_admin").eq("id", authData.user.id).maybeSingle();
    if (profileError) return reply({ error: "Admin verification failed" }, 500);
    const username = String(profile?.username || "").replace(/^@/, "").toLowerCase();
    const allowed = username === "p2p_social_admin" || profile?.is_admin === true ||
      String(profile?.role || "").toLowerCase() === "admin";
    if (!allowed) return reply({ error: "Admin access required" }, 403);

    const claims = claimsFrom(token);
    const aal = String(claims.aal || "aal1");

    if (req.method === "GET") {
      const [features, users, events, logs] = await Promise.all([
        admin.from("admin_feature_registry").select("feature_key,name,category,priority,readiness,monitoring_enabled,updated_at").order("priority"),
        admin.from("profiles").select("id,username,verification_status,last_seen_at").order("created_at", { ascending: false }).limit(100),
        admin.from("admin_security_events").select("user_id,event_type,device_type,browser,operating_system,ip_prefix,created_at").order("created_at", { ascending: false }).limit(50),
        admin.from("admin_audit_logs").select("id,actor_id,action,target_type,target_id,details,created_at").order("created_at", { ascending: false }).limit(50),
      ]);
      const failure = [features, users, events, logs].find(x => x.error);
      if (failure) return reply({ error: "Could not load controller data" }, 500);
      return reply({
        success: true,
        checked_at: new Date().toISOString(),
        current_aal: aal,
        actions_require_mfa: true,
        features: features.data || [],
        users: users.data || [],
        security_events: events.data || [],
        audit_logs: logs.data || [],
      });
    }

    if (aal !== "aal2") return reply({ error: "Complete MFA verification before using admin controls" }, 403);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "set_monitoring") {
      const key = String(body.feature_key || "");
      if (!/^[a-z0-9_]{2,64}$/.test(key) || typeof body.enabled !== "boolean") return reply({ error: "Invalid feature setting" }, 400);
      const { data, error } = await admin.from("admin_feature_registry")
        .update({ monitoring_enabled: body.enabled, updated_at: new Date().toISOString(), updated_by: authData.user.id })
        .eq("feature_key", key).select("feature_key,monitoring_enabled").maybeSingle();
      if (error || !data) return reply({ error: "Feature setting could not be updated" }, 400);
      await logAction(admin, authData.user.id, "feature_monitoring_changed", "feature", key, { monitoring_enabled: body.enabled });
      return reply({ success: true, action, result: data });
    }

    if (action === "set_verification") {
      const userId = String(body.user_id || "");
      const status = String(body.status || "");
      if (!/^[0-9a-f-]{36}$/i.test(userId) || !["verified", "unverified"].includes(status)) return reply({ error: "Invalid verification request" }, 400);
      const { data, error } = await admin.from("profiles").update({ verification_status: status })
        .eq("id", userId).select("id,username,verification_status").maybeSingle();
      if (error || !data) return reply({ error: "User verification status was not changed" }, 400);
      await logAction(admin, authData.user.id, "user_verification_changed", "user", userId, { status });
      return reply({ success: true, action, result: data });
    }

    return reply({ error: "Unsupported admin action" }, 400);
  } catch {
    return reply({ error: "Admin controller error" }, 500);
  }
});
