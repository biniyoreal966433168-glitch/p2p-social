import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://p2p-social.vercel.app",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

function decodeClaims(token: string) {
  try {
    const part = token.split(".")[1];
    let encoded = part.replace(/-/g, "+").replace(/_/g, "/");
    encoded += "=".repeat((4 - encoded.length % 4) % 4);
    return JSON.parse(atob(encoded));
  } catch { return {}; }
}

function classifyDevice(ua: string) {
  const value = ua.toLowerCase();
  const device = /ipad|tablet/.test(value) ? "tablet" :
    /mobi|android|iphone/.test(value) ? "mobile" : "desktop";
  const browser = /edg\//.test(value) ? "Edge" :
    /opr\//.test(value) ? "Opera" :
    /firefox\//.test(value) ? "Firefox" :
    /chrome\//.test(value) && !/edg\//.test(value) ? "Chrome" :
    /safari\//.test(value) && !/chrome\//.test(value) ? "Safari" : "Other";
  const os = /android/.test(value) ? "Android" :
    /iphone|ipad|ios/.test(value) ? "iOS" :
    /windows/.test(value) ? "Windows" :
    /mac os|macintosh/.test(value) ? "macOS" :
    /linux/.test(value) ? "Linux" : "Other";
  return { device, browser, os };
}

function coarseIpPrefix(raw: string | null) {
  if (!raw) return null;
  const ip = raw.trim().replace(/^::ffff:/i, "");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts.some(n => n < 0 || n > 255)) return null;
    return parts.slice(0, 3).join(".") + ".0/24";
  }
  if (ip.includes(":")) {
    const groups = ip.split(":").filter(Boolean);
    return groups.slice(0, 3).join(":") + "::/48";
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  const origin = req.headers.get("Origin");
  if (origin && origin !== "https://p2p-social.vercel.app") return reply({ error: "Origin not allowed" }, 403);

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return reply({ error: "Unauthorized" }, 401);

  try {
    const userClient = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await userClient.auth.getUser(token);
    if (error || !data.user) return reply({ error: "Invalid session" }, 401);

    const body = await req.json().catch(() => ({}));
    if (body?.event_type !== "login_success") return reply({ error: "Unsupported event" }, 400);

    const claims = decodeClaims(token);
    const sessionId = typeof claims.session_id === "string" ? claims.session_id : "";
    if (!sessionId) return reply({ error: "Session identifier missing" }, 400);

    const ua = req.headers.get("user-agent") || "";
    const device = classifyDevice(ua);
    const rawIp = req.headers.get("cf-connecting-ip");
    const ipPrefix = coarseIpPrefix(rawIp);

    const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: insertError } = await admin.from("admin_security_events").upsert({
      user_id: data.user.id,
      session_id: sessionId,
      event_type: "login_success",
      device_type: device.device,
      browser: device.browser,
      operating_system: device.os,
      ip_prefix: ipPrefix,
    }, { onConflict: "user_id,session_id,event_type", ignoreDuplicates: true });

    if (insertError) return reply({ error: "Could not record security event" }, 500);
    return reply({ success: true, recorded: true });
  } catch {
    return reply({ error: "Security event service error" }, 500);
  }
});
