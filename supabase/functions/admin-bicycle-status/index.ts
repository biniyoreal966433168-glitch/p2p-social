import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://p2p-social.vercel.app",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Vary": "Origin",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BICYCLE_API_URL = Deno.env.get("BICYCLE_API_URL") || "";
const BICYCLE_API_TOKEN = Deno.env.get("BICYCLE_API_TOKEN") || "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function countRows(admin: ReturnType<typeof createClient>, table: string, filter?: { column: string; value: string | boolean }) {
  let query = admin.from(table).select("id", { count: "exact", head: true });
  if (filter) query = query.eq(filter.column, filter.value);
  const { count, error } = await query;
  return error ? { available: false, rows: null } : { available: true, rows: count ?? 0 };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const origin = req.headers.get("Origin");
    if (origin && origin !== "https://p2p-social.vercel.app") return json({ error: "Origin not allowed" }, 403);

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Invalid or expired session" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("username,role,is_admin")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (profileError) return json({ error: "Could not verify admin profile" }, 500);

    const username = String(profile?.username || "").replace(/^@/, "").toLowerCase();
    const allowed = username === "p2p_social_admin" || profile?.is_admin === true ||
      String(profile?.role || "").toLowerCase() === "admin";
    if (!allowed) return json({ error: "Admin access required" }, 403);

    const checkedAt = new Date().toISOString();
    const [profiles, verifiedUsers, unverifiedUsers, trades, disputedTrades, paymentUnconfirmed,
      orders, activeOrders, userReports, openUserReports, postReports, pendingPostReports,
      deposits, withdrawals, pendingWithdrawals, balanceSnapshots, walletLedger,
      tonTransfers, usdtTransfers, notifications] = await Promise.all([
      countRows(admin, "profiles"),
      countRows(admin, "profiles", { column: "verification_status", value: "verified" }),
      countRows(admin, "profiles", { column: "verification_status", value: "unverified" }),
      countRows(admin, "p2p_trades"),
      countRows(admin, "p2p_trades", { column: "status", value: "disputed" }),
      countRows(admin, "p2p_trades", { column: "payment_confirmed", value: false }),
      countRows(admin, "p2p_orders"),
      countRows(admin, "p2p_orders", { column: "status", value: "active" }),
      countRows(admin, "user_reports"),
      countRows(admin, "user_reports", { column: "status", value: "open" }),
      countRows(admin, "post_reports"),
      countRows(admin, "post_reports", { column: "status", value: "pending" }),
      countRows(admin, "bicycle_deposit_addresses"),
      countRows(admin, "bicycle_withdrawals"),
      countRows(admin, "bicycle_withdrawals", { column: "status", value: "pending" }),
      countRows(admin, "bicycle_balance_snapshots"),
      countRows(admin, "wallet_balance_ledger"),
      countRows(admin, "ton_transfers"),
      countRows(admin, "usdt_transfers"),
      countRows(admin, "notifications"),
    ]);

    const metrics = {
      profiles, verified_users: verifiedUsers, unverified_users: unverifiedUsers,
      trades, disputed_trades: disputedTrades, payment_unconfirmed_trades: paymentUnconfirmed,
      orders, active_orders: activeOrders, user_reports: userReports, open_user_reports: openUserReports,
      post_reports: postReports, pending_post_reports: pendingPostReports,
      deposit_addresses: deposits, withdrawals, pending_withdrawals: pendingWithdrawals,
      balance_snapshots: balanceSnapshots, wallet_ledger: walletLedger,
      ton_transfers: tonTransfers, usdt_transfers: usdtTransfers, notifications,
    };

    let bicycle: Record<string, unknown> = {
      configured: Boolean(BICYCLE_API_URL && BICYCLE_API_TOKEN),
      reachable: false,
      status: BICYCLE_API_URL && BICYCLE_API_TOKEN ? "checking" : "not_configured",
    };

    if (BICYCLE_API_URL && BICYCLE_API_TOKEN) {
      try {
        const base = BICYCLE_API_URL.replace(/\/+$/, "");
        const response = await fetch(`${base}/v1/system/sync`, {
          method: "GET",
          headers: { Authorization: `Bearer ${BICYCLE_API_TOKEN}`, Accept: "application/json" },
          signal: AbortSignal.timeout(8000),
        });
        const raw = await response.text();
        let payload: any = {};
        try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = {}; }
        bicycle = {
          configured: true, reachable: response.ok, http_status: response.status,
          status: response.ok ? "reachable" : "http_error",
          sync: response.ok ? payload : undefined,
        };
      } catch {
        bicycle = { configured: true, reachable: false, status: "unreachable" };
      }
    }

    const tables = [
      "profiles", "p2p_orders", "p2p_trades", "user_reports", "post_reports",
      "bicycle_deposit_addresses", "bicycle_withdrawals", "bicycle_balance_snapshots",
      "wallet_balance_ledger", "ton_transfers", "usdt_transfers", "notifications",
    ];
    const counts = await Promise.all(tables.map(async table => [table, await countRows(admin, table)] as const));

    return json({
      success: true,
      checked_at: checkedAt,
      edge_function: { name: "admin-bicycle-status", responding: true, authenticated: true },
      bicycle,
      metrics,
      database_tables: Object.fromEntries(counts),
      recommendations: [
        "Keep Bicycle API URL and token in Edge Function secrets; never expose them in browser code.",
        "Keep the Bicycle processor API private and expose it only through a protected HTTPS tunnel or trusted network.",
        "Treat a reachable API as connectivity only; it does not prove node consensus, transaction finality, or available funds.",
        "Use transaction records and balance snapshots for reconciliation; counts alone do not prove balances are correct.",
        "This endpoint is read-only. It does not change user roles, approve reports, alter balances, or sign/broadcast transactions.",
        "Login/device/IP history, MFA enforcement, fraud rules, rate limits, immutable admin audit logs, backups, and restore tests need dedicated verified backend components before they can be marked operational.",
      ],
    });
  } catch {
    return json({ error: "Internal diagnostics error" }, 500);
  }
});
