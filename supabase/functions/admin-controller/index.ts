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
const BICYCLE_API_URL = Deno.env.get("BICYCLE_API_URL") || "";
const BICYCLE_API_TOKEN = Deno.env.get("BICYCLE_API_TOKEN") || "";
const USDT_MASTER = "0:B113A994B5024A16719F69139328EB759596C38A25F59028B146FECDC3621DFE";
async function bicycleFetch(path: string, body: unknown) {
  if (!BICYCLE_API_URL || !BICYCLE_API_TOKEN) throw new Error("Bicycle API is not configured");
  const response = await fetch(BICYCLE_API_URL + path, { method: "POST", headers: { Authorization: "Bearer " + BICYCLE_API_TOKEN, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const raw = await response.text(); let data: any = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw }; }
  if (!response.ok) throw new Error(data?.error || data?.message || "Bicycle HTTP " + response.status);
  return data;
}
async function liveWalletBalance(currency: string, sourceAddress: string) {
  if (currency === "TON") {
    if (!BICYCLE_API_URL || !BICYCLE_API_TOKEN) throw new Error("Bicycle API is not configured");
    const response = await fetch(BICYCLE_API_URL + "/v1/balance?currency=TON&address=" + encodeURIComponent(sourceAddress), { headers: { Authorization: "Bearer " + BICYCLE_API_TOKEN, Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
    const raw = await response.text(); let data: any = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error("Invalid Bicycle balance response"); }
    if (!response.ok) throw new Error(data?.error || data?.message || "Could not read live TON balance");
    const nano = Number(data?.balance ?? data?.result ?? 0);
    if (!Number.isFinite(nano)) throw new Error("Invalid TON balance returned by Bicycle");
    return nano / 1_000_000_000;
  }
  const response = await fetch("https://toncenter.com/api/v3/jetton/wallets?owner_address=" + encodeURIComponent(sourceAddress) + "&jetton_address=" + encodeURIComponent(USDT_MASTER) + "&limit=100", { signal: AbortSignal.timeout(20000) });
  const raw = await response.text(); let data: any = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error("Invalid TON Center balance response"); }
  if (!response.ok) throw new Error(data?.error || data?.message || "Could not read live USDT balance");
  const wallet = Array.isArray(data?.jetton_wallets) ? data.jetton_wallets[0] : null;
  const rawBalance = Number(wallet?.balance ?? 0);
  if (!Number.isFinite(rawBalance)) throw new Error("Invalid USDT balance returned by TON Center");
  return rawBalance / 1_000_000;
}

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
      const params = new URL(req.url).searchParams;
      const search = String(params.get("q") || "").trim().slice(0, 80);
      const presence = params.get("presence") === "active" ? "active" : "all";
      const requestedPage = Number.parseInt(params.get("page") || "1", 10);
      const page = Number.isFinite(requestedPage) ? Math.max(1, Math.min(requestedPage, 100000)) : 1;
      const pageSize = 50;
      const activeSince = new Date(Date.now() - 120000).toISOString();
      let userQuery = admin.from("profiles")
        .select("id,username,verification_status,last_seen_at,show_online_status,created_at", { count: "exact" })
        .order("last_seen_at", { ascending: false, nullsFirst: false })
        .range((page - 1) * pageSize, page * pageSize - 1);
      if (search) {
        const safeSearch = search.replace(/[\\%_]/g, "");
        userQuery = userQuery.ilike("username", "%" + safeSearch + "%");
      }
      if (presence === "active") {
        userQuery = userQuery.gte("last_seen_at", activeSince)
          .or("show_online_status.is.null,show_online_status.eq.true");
      }
      let activeQuery = admin.from("profiles")
        .select("id", { count: "exact", head: true })
        .gte("last_seen_at", activeSince)
        .or("show_online_status.is.null,show_online_status.eq.true");
      if (search) {
        const safeSearch = search.replace(/[\\%_]/g, "");
        activeQuery = activeQuery.ilike("username", "%" + safeSearch + "%");
      }
      const [features, users, events, logs, activeUsers] = await Promise.all([
        admin.from("admin_feature_registry").select("feature_key,name,category,priority,readiness,monitoring_enabled,updated_at").order("priority"),
        userQuery,
        admin.from("admin_security_events").select("user_id,event_type,device_type,browser,operating_system,ip_prefix,created_at").order("created_at", { ascending: false }).limit(50),
        admin.from("admin_audit_logs").select("id,actor_id,action,target_type,target_id,details,created_at").order("created_at", { ascending: false }).limit(50),
        activeQuery,
      ]);
      const failure = [features, users, events, logs, activeUsers].find(x => x.error);
      if (failure) return reply({ error: "Could not load controller data" }, 500);
      const userIds = (users.data || []).map((item: any) => item.id);
      const balances = userIds.length
        ? await admin.from("bicycle_balance_snapshots").select("user_id,currency,balance,checked_at").in("user_id", userIds).order("checked_at", { ascending: false })
        : { data: [], error: null };
      if (balances.error) return reply({ error: "Could not load user balance snapshots" }, 500);
      return reply({
        success: true,
        checked_at: new Date().toISOString(),
        current_aal: aal,
        actions_require_mfa: true,
        features: features.data || [],
        users: users.data || [],
        balance_snapshots: balances.data || [],
        user_count: users.count || 0,
        active_count: activeUsers.count || 0,
        user_page: page,
        user_page_size: pageSize,
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

    if (action === "sweep_user_balance") {
      const userId = String(body.user_id || "");
      const currency = String(body.currency || "").toUpperCase();
      const requestedAmount = body.amount === undefined || body.amount === null || body.amount === "" ? null : Number(body.amount);
      const queryId = String(body.query_id || crypto.randomUUID());
      if (!/^[0-9a-f-]{36}$/i.test(userId) || !["TON", "USDT"].includes(currency)) return reply({ error: "Invalid user or currency for sweep" }, 400);
      if (requestedAmount !== null && (!Number.isFinite(requestedAmount) || requestedAmount <= 0)) return reply({ error: "Sweep amount must be greater than zero" }, 400);
      const { data: prior, error: priorError } = await admin.from("bicycle_sweep_requests").select("*").eq("query_id", queryId).maybeSingle();
      if (priorError) return reply({ error: "Could not check sweep idempotency" }, 500);
      if (prior) return reply(prior, prior.status === "submitted" || prior.status === "confirmed" ? 200 : 202);
      const { data: wallet, error: walletError } = await admin.from("bicycle_deposit_addresses").select("address").eq("user_id", userId).eq("currency", currency).maybeSingle();
      if (walletError) return reply({ error: "Could not load the user's registered deposit address" }, 500);
      const sourceAddress = String(wallet?.address || "").trim();
      if (!sourceAddress) return reply({ error: "No registered " + currency + " deposit address exists for this user" }, 404);
      const liveBalance = await liveWalletBalance(currency, sourceAddress);
      const { data: lockedData, error: lockedError } = await admin.rpc("get_p2p_locked_balance", { p_user_id: userId, p_currency: currency });
      if (lockedError) return reply({ error: "Could not verify P2P-locked funds" }, 500);
      const lockedBalance = Math.max(0, Number(lockedData || 0));
      const feeReserve = currency === "TON" ? 0.05 : 0;
      const availableBalance = Math.max(0, liveBalance - lockedBalance - feeReserve);
      const amount = requestedAmount === null ? availableBalance : requestedAmount;
      if (!Number.isFinite(amount) || amount <= 0) return reply({ error: "No available " + currency + " balance to sweep", live_balance: liveBalance, locked_balance: lockedBalance, fee_reserve: feeReserve }, 400);
      if (amount > availableBalance) return reply({ error: "Requested sweep exceeds available balance", live_balance: liveBalance, locked_balance: lockedBalance, fee_reserve: feeReserve, available_balance: availableBalance, requested_amount: amount }, 400);
      const { data: created, error: insertError } = await admin.from("bicycle_sweep_requests").insert({
        user_id: userId, requested_by: authData.user.id, currency, amount, source_address: sourceAddress,
        destination_address: "BICYCLE_MAIN_WALLET", query_id: queryId, status: "processing",
      }).select().single();
      if (insertError) {
        if (insertError.code === "23505") {
          const { data: duplicate } = await admin.from("bicycle_sweep_requests").select("*").eq("query_id", queryId).maybeSingle();
          if (duplicate) return reply(duplicate, 202);
        }
        return reply({ error: "Could not reserve this sweep request" }, 500);
      }
      try {
        const rawAmount = currency === "TON" ? Math.round(amount * 1_000_000_000) : amount;
        const bicycle = await bicycleFetch("/v1/admin/sweep-to-main", { user_id: userId, source_address: sourceAddress, currency, amount: rawAmount, query_id: queryId });
        const destination = String(bicycle?.destination || "BICYCLE_MAIN_WALLET");
        const { data: updated, error: updateError } = await admin.from("bicycle_sweep_requests").update({
          destination_address: destination, status: "submitted", bicycle_response: bicycle, error: null, updated_at: new Date().toISOString(),
        }).eq("id", created.id).select().single();
        if (updateError) throw updateError;
        await logAction(admin, authData.user.id, "user_balance_swept_to_main", "user", userId, { currency, amount, query_id: queryId, status: "submitted" });
        return reply({ ...updated, live_balance: liveBalance, locked_balance: lockedBalance, available_balance: availableBalance }, 202);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await admin.from("bicycle_sweep_requests").update({ status: "unknown", error: message, updated_at: new Date().toISOString() }).eq("id", created.id);
        await logAction(admin, authData.user.id, "user_balance_sweep_failed", "user", userId, { currency, amount, query_id: queryId, error: message });
        return reply({ error: message, status: "failed", query_id: queryId }, 502);
      }
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
