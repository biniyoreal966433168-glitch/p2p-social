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
class BicycleHttpError extends Error {
  status: number;
  endpoint: string;
  constructor(status: number, endpoint: string, message: string) {
    super(message);
    this.name = "BicycleHttpError";
    this.status = status;
    this.endpoint = endpoint;
  }
}
function bicycleEndpoint(path: string): string {
  let base = BICYCLE_API_URL.trim();
  while (base.endsWith("/")) base = base.slice(0, -1);
  if (base.toLowerCase().endsWith("/v1")) base = base.slice(0, -3);
  const normalizedPath = path.startsWith("/") ? path : "/" + path;
  return base + normalizedPath;
}
async function bicycleFetch(path: string, body: unknown) {
  if (!BICYCLE_API_URL || !BICYCLE_API_TOKEN) throw new Error("Bicycle API is not configured");
  const endpoint = bicycleEndpoint(path);
  const response = await fetch(endpoint, { method: "POST", headers: { Authorization: "Bearer " + BICYCLE_API_TOKEN, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  const raw = await response.text(); let data: any = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw }; }
  if (!response.ok) throw new BicycleHttpError(response.status, endpoint, String(data?.error || data?.message || "Bicycle HTTP " + response.status).trim());
  return data;
}
function normalizeTonAddress(input: string): string | null {
  const value = input.trim();
  const raw = value.match(/^(-1|0):([0-9a-fA-F]{64})$/);
  if (raw) return raw[1] + ":" + raw[2].toLowerCase();
  if (!/^[A-Za-z0-9_-]{48}$/.test(value)) return null;
  try {
    let encoded = value.replace(/-/g, "+").replace(/_/g, "/");
    encoded += "=".repeat((4 - encoded.length % 4) % 4);
    const binary = atob(encoded);
    if (binary.length !== 36) return null;
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    // TON friendly addresses use 0x11 (bounceable) or 0x51 (non-bounceable).
    // Normalize both to the same account hash while rejecting test-only addresses.
    if ((bytes[0] & 0x80) !== 0) return null;
    const tag = bytes[0] & 0x3f;
    if (tag !== 0x11) return null;
    const workchain = bytes[1] > 127 ? bytes[1] - 256 : bytes[1];
    if (workchain !== -1 && workchain !== 0) return null;
    let crc = 0;
    for (let i = 0; i < 34; i++) {
      crc ^= bytes[i] << 8;
      for (let bit = 0; bit < 8; bit++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    if (bytes[34] !== ((crc >> 8) & 255) || bytes[35] !== (crc & 255)) return null;
    const hash = Array.from(bytes.slice(2, 34), b => b.toString(16).padStart(2, "0")).join("");
    return workchain + ":" + hash;
  } catch { return null; }
}
async function liveWalletBalance(currency: string, sourceAddress: string) {
  if (currency === "TON") {
    const response = await fetch("https://toncenter.com/api/v2/getAddressBalance?address=" + encodeURIComponent(sourceAddress), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
    const raw = await response.text(); let data: any = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error("Invalid TON Center balance response"); }
    if (!response.ok || data?.ok !== true) throw new Error(data?.error || data?.description || "Could not read live TON balance");
    const nano = Number(data?.result);
    if (!Number.isFinite(nano) || nano < 0) throw new Error("Invalid TON balance returned by TON Center");
    return nano / 1_000_000_000;
  }
  const response = await fetch("https://toncenter.com/api/v3/jetton/wallets?owner_address=" + encodeURIComponent(sourceAddress) + "&jetton_address=" + encodeURIComponent(USDT_MASTER) + "&limit=100", { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
  const raw = await response.text(); let data: any = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error("Invalid TON Center balance response"); }
  if (!response.ok) throw new Error(data?.error || data?.message || "Could not read live USDT balance");
  const wallet = Array.isArray(data?.jetton_wallets) ? data.jetton_wallets[0] : null;
  const rawBalance = Number(wallet?.balance ?? 0);
  if (!Number.isFinite(rawBalance) || rawBalance < 0) throw new Error("Invalid USDT balance returned by TON Center");
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
      const params = new globalThis.URL(req.url).searchParams;
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

    if (action === "admin_main_wallet_withdraw") {
      const currency = String(body.currency || "").toUpperCase();
      const senderAddress = String(Deno.env.get("BICYCLE_MAIN_WALLET_ADDRESS") || "").trim();
      const destination = String(body.destination || "").trim();
      const requestedAmount = body.amount === undefined || body.amount === null || body.amount === "" ? null : Number(body.amount);
      const queryId = String(body.query_id || "");
      const expectedMainWallet = "UQCt8Gf5ZHPmoXW_d6x0Ttt551tIg-KJZSx1CsSIIwE8NYUv";
      const configuredMainWallet = String(Deno.env.get("BICYCLE_MAIN_WALLET_ADDRESS") || "").trim();
      const normalizedExpected = normalizeTonAddress(expectedMainWallet);
      const normalizedConfigured = normalizeTonAddress(configuredMainWallet);
      const normalizedSender = normalizeTonAddress(senderAddress);
      const normalizedDestination = normalizeTonAddress(destination);

      if (!normalizedConfigured || normalizedConfigured !== normalizedExpected) {
        return reply({ error: "Withdrawal blocked: configure BICYCLE_MAIN_WALLET_ADDRESS to the verified Bicycle main signer address." }, 503);
      }
      if (!normalizedSender || normalizedSender !== normalizedConfigured) {
        return reply({ error: "Sender address does not match the verified Bicycle main-wallet signer." }, 403);
      }
      if (!normalizedDestination || !["TON", "USDT"].includes(currency)) {
        return reply({ error: "Enter a valid receiver TON address and select TON or USDT." }, 400);
      }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(queryId)) {
        return reply({ error: "Invalid withdrawal request ID." }, 400);
      }
      const decimals = currency === "TON" ? 9 : 6;
      const scale = currency === "TON" ? 1_000_000_000 : 1_000_000;
      if (requestedAmount === null || !Number.isFinite(requestedAmount) || requestedAmount <= 0 ||
          Math.abs(requestedAmount * scale - Math.round(requestedAmount * scale)) > 0.0001) {
        return reply({ error: "Enter a positive amount with up to " + decimals + " decimal places." }, 400);
      }
      const rawAmount = Math.round(requestedAmount * scale);
      if (!Number.isSafeInteger(rawAmount)) return reply({ error: "Withdrawal amount is too large." }, 400);

      const { data: prior, error: priorError } = await admin.from("bicycle_withdrawals")
        .select("*").eq("user_id", authData.user.id).eq("query_id", queryId).maybeSingle();
      if (priorError) return reply({ error: "Could not check withdrawal request history." }, 500);
      if (prior) {
        if (String(prior.flow_type || "") !== "admin_main_wallet" ||
            String(prior.currency || "") !== currency ||
            Number(prior.amount) !== requestedAmount ||
            normalizeTonAddress(String(prior.destination || "")) !== normalizedDestination) {
          return reply({ error: "This request ID already belongs to a different withdrawal." }, 409);
        }
        return reply({
          success: prior.status === "completed",
          status: prior.status,
          query_id: queryId,
          final_tx_hash: prior.final_tx_hash || null,
          already_recorded: true,
          retry_blocked: true,
        }, 202);
      }

      const mainBalance = await liveWalletBalance(currency, senderAddress);
      const reserve = 0.05;
      if (requestedAmount > mainBalance || currency === "TON" && requestedAmount + reserve > mainBalance) {
        return reply({
          error: "Insufficient Bicycle main-wallet balance. TON network gas reserve is not included in the payout amount.",
          currency, main_balance: mainBalance, network_reserve_ton: reserve, requested_amount: requestedAmount,
        }, 400);
      }
      if (currency === "USDT") {
        const tonBalance = await liveWalletBalance("TON", senderAddress);
        if (tonBalance < reserve) return reply({ error: "Insufficient TON for network gas reserve.", ton_balance: tonBalance, required_reserve: reserve }, 400);
      }

      const { data: created, error: insertError } = await admin.from("bicycle_withdrawals").insert({
        user_id: authData.user.id,
        query_id: queryId,
        currency,
        amount: requestedAmount,
        destination,
        status: "processing",
        flow_type: "admin_main_wallet",
        fee_percent: 0,
        fee_amount: 0,
        fixed_fee_ton: 0,
        sweep_amount: 0,
      }).select().single();
      if (insertError) return reply({ error: "Could not reserve this admin withdrawal request." }, 500);

      try {
        const bicycleAmount = requestedAmount.toFixed(decimals).replace(/\.?0+$/, "");
        const directEndpoint = currency === "TON"
          ? "/v1/withdrawal/direct-ton"
          : "/v1/withdrawal/direct-usdt";
        const payout = await bicycleFetch(directEndpoint, {
          query_id: queryId,
          currency,
          amount: bicycleAmount,
          destination,
        });
        if (payout?.submitted !== true) {
          throw new Error("Bicycle direct-withdrawal endpoint did not confirm that the broadcast was submitted.");
        }
        const hashCandidates = [
          payout?.transaction_hash, payout?.tx_hash, payout?.hash,
          payout?.transaction?.hash, payout?.result?.transaction_hash,
        ];
        let txHash: string | null = null;
        for (const candidate of hashCandidates) {
          const value = String(candidate || "").replace(/^0x/i, "").trim();
          if (/^[0-9a-f]{64}$/i.test(value)) { txHash = value.toLowerCase(); break; }
        }
        const finalStatus = txHash ? "completed" : "broadcast_unknown";
        const { error: updateError } = await admin.from("bicycle_withdrawals").update({
          status: finalStatus, final_tx_hash: txHash, updated_at: new Date().toISOString(),
        }).eq("id", created.id);
        if (updateError) throw updateError;
        try {
          await logAction(admin, authData.user.id, "admin_main_wallet_withdrawal_" + finalStatus,
            "wallet", senderAddress, {
              sender_address: senderAddress, receiver_address: destination, currency,
              amount: requestedAmount, query_id: queryId, platform_fee: 0,
              fixed_fee_ton: 0, final_tx_hash: txHash,
            });
        } catch (auditError) {
          console.error("Admin payout audit log failed after Bicycle response", auditError);
        }
        return reply({
          success: payout?.submitted === true, submitted: payout?.submitted === true,
          confirmation_status: String(payout?.confirmation_status || (txHash ? "confirmed" : "pending")),
          status: finalStatus, query_id: queryId,
          sender_address: senderAddress, destination, currency, amount: requestedAmount,
          platform_fee: 0, fixed_fee_ton: 0, final_tx_hash: txHash,
          tonviewer_url: txHash ? "https://tonviewer.com/transaction/" + txHash : null,
          admin_review_required: !txHash,
        }, txHash ? 200 : 202);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const httpStatus = error instanceof BicycleHttpError ? error.status : null;
        const finalStatus = httpStatus !== null && httpStatus >= 400 && httpStatus < 500 ? "failed" : "broadcast_unknown";
        await admin.from("bicycle_withdrawals").update({ status: finalStatus, updated_at: new Date().toISOString() }).eq("id", created.id);
        try {
          await logAction(admin, authData.user.id, "admin_main_wallet_withdrawal_" + finalStatus,
            "wallet", senderAddress, {
              sender_address: senderAddress, receiver_address: destination, currency,
              amount: requestedAmount, query_id: queryId, platform_fee: 0,
              error: message, http_status: httpStatus,
            });
        } catch (auditError) {
          console.error("Admin payout failure audit log failed", auditError);
        }
        return reply({
          success: false, status: finalStatus, query_id: queryId, error: message,
          retry_blocked: finalStatus === "broadcast_unknown",
        }, finalStatus === "failed" ? 502 : 202);
      }
    }

    if (action === "sweep_user_balance") {
      const userAddress = String(body.address || "").trim();
      const currency = String(body.currency || "").toUpperCase();
      const requestedAmount = body.amount === undefined || body.amount === null || body.amount === "" ? null : Number(body.amount);
      const queryId = String(body.query_id || crypto.randomUUID());
      const normalizedInputAddress = normalizeTonAddress(userAddress);
      if (!normalizedInputAddress || !["TON", "USDT"].includes(currency)) return reply({ error: "Enter a valid TON address with a correct friendly-address checksum, and select TON or USDT" }, 400);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(queryId)) return reply({ error: "Invalid sweep request ID" }, 400);
      if (requestedAmount === null) return reply({ error: "Enter the exact amount to sweep; automatic full-balance sweep is disabled" }, 400);
      const amountScale = currency === "TON" ? 1_000_000_000 : 1_000_000;
      if (!Number.isFinite(requestedAmount) || requestedAmount <= 0 || Math.abs(requestedAmount * amountScale - Math.round(requestedAmount * amountScale)) > 0.0001) return reply({ error: "Sweep amount must be positive and use valid precision" }, 400);

      const { data: registeredWallets, error: walletError } = await admin.from("bicycle_deposit_addresses")
        .select("user_id,address,currency").eq("currency", currency);
      if (walletError) return reply({ error: "Could not verify the registered deposit address" }, 500);
      const wallets = (registeredWallets || []).filter((item: any) => normalizeTonAddress(String(item.address || "")) === normalizedInputAddress);
      if (wallets.length === 0) return reply({ error: "This address is not registered as a user's " + currency + " deposit address" }, 404);
      if (wallets.length !== 1) return reply({ error: "This deposit address is linked to multiple accounts; sweep blocked" }, 409);
      const wallet = wallets[0];
      const userId = String(wallet.user_id || "");
      const sourceAddress = String(wallet.address || "").trim();
      if (!userId || !sourceAddress) return reply({ error: "Registered address ownership could not be verified" }, 409);

      const { data: prior, error: priorError } = await admin.from("bicycle_sweep_requests").select("*").eq("query_id", queryId).maybeSingle();
      if (priorError) return reply({ error: "Could not check sweep idempotency" }, 500);
      if (prior) {
        if (prior.user_id !== userId || prior.currency !== currency || prior.source_address !== sourceAddress) return reply({ error: "Sweep request ID already belongs to a different address" }, 409);
        return reply(prior, prior.status === "submitted" || prior.status === "confirmed" ? 200 : 202);
      }
      const liveBalance = await liveWalletBalance(currency, sourceAddress);
      const { data: lockedData, error: lockedError } = await admin.rpc("get_p2p_locked_balance", { p_user_id: userId, p_currency: currency });
      if (lockedError) return reply({ error: "Could not verify P2P-locked funds" }, 500);
      const lockedBalance = Math.max(0, Number(lockedData || 0));
      const feeReserve = 0;
      const availableBalance = Math.max(0, liveBalance - lockedBalance - feeReserve);
      const amount = requestedAmount;
      if (!Number.isFinite(amount) || amount <= 0) return reply({ error: "No available " + currency + " balance to sweep", live_balance: liveBalance, locked_balance: lockedBalance, fee_reserve: feeReserve }, 400);
      if (amount > availableBalance) return reply({ error: "Requested sweep exceeds available balance", live_balance: liveBalance, locked_balance: lockedBalance, fee_reserve: feeReserve, available_balance: availableBalance, requested_amount: amount }, 400);
      const { data: created, error: insertError } = await admin.from("bicycle_sweep_requests").insert({
        user_id: userId, requested_by: authData.user.id, request_origin: "admin", currency, amount, source_address: sourceAddress,
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
        const amountDecimals = currency === "TON" ? 9 : 6;
        const bicycleAmount = amount.toFixed(amountDecimals).replace(/\.?0+$/, "");
        const bicycle = await bicycleFetch("/v1/admin/sweep-to-main", { source_address: sourceAddress, currency, amount: bicycleAmount });
        const destination = String(bicycle?.destination || "BICYCLE_MAIN_WALLET");
        const { data: updated, error: updateError } = await admin.from("bicycle_sweep_requests").update({
          destination_address: destination, status: "submitted", bicycle_response: bicycle, error: null, updated_at: new Date().toISOString(),
        }).eq("id", created.id).select().single();
        if (updateError) throw updateError;
        try {
          await logAction(admin, authData.user.id, "user_balance_swept_to_main", "user", userId, { currency, amount, query_id: queryId, status: "submitted" });
        } catch (auditError) {
          console.error("Sweep was submitted but audit logging failed", auditError);
        }
        return reply({ ...updated, live_balance: liveBalance, locked_balance: lockedBalance, available_balance: availableBalance }, 202);
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : String(error);
        const httpStatus = error instanceof BicycleHttpError ? error.status : null;
        const endpoint = error instanceof BicycleHttpError ? error.endpoint : null;
        // A 404 means the running Bicycle processor has no registered sweep route.
        // It is a definitive rejection: no sweep transaction was broadcast.
        const routeMissing = httpStatus === 404;
        const message = routeMissing
          ? "Bicycle processor returned 404 for the sweep route. POST /v1/admin/sweep-to-main is not available on the running processor. No sweep was broadcast; deploy the Bicycle processor with this route before retrying."
          : rawMessage;
        // Definitive 4xx rejections did not execute a sweep; network/5xx outcomes remain uncertain.
        const requestStatus = httpStatus !== null && httpStatus >= 400 && httpStatus < 500 ? "failed" : "unknown";
        await admin.from("bicycle_sweep_requests").update({
          status: requestStatus, error: message, updated_at: new Date().toISOString(),
        }).eq("id", created.id);
        try {
          await logAction(admin, authData.user.id, "user_balance_sweep_failed", "user", userId, {
            currency, amount, query_id: queryId, error: message, http_status: httpStatus, endpoint,
            transaction_broadcast: routeMissing ? false : null,
          });
        } catch (auditError) {
          console.error("Sweep failure audit log could not be saved", auditError);
        }
        return reply({
          error: message, status: requestStatus, query_id: queryId, http_status: httpStatus,
          endpoint, transaction_broadcast: routeMissing ? false : null,
        }, routeMissing ? 503 : 502);
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
