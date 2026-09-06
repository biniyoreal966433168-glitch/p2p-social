import { createClient } from "npm:@supabase/supabase-js@2";
import { TronWeb } from "npm:tronweb@6";

const supabase = createClient(
Deno.env.get("SUPABASE_URL")!,
Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const tronWeb = new TronWeb({
fullHost: "https://api.trongrid.io",
headers: {
"TRON-PRO-API-KEY": Deno.env.get("TRONGRID_API_KEY") || "",
},
});

Deno.serve(async (req) => {
try {
if (req.method !== "POST") {
return new Response(
JSON.stringify({ error: "POST required" }),
{
status: 405,
headers: { "Content-Type": "application/json" },
}
);
}

const authHeader = req.headers.get("Authorization");

if (!authHeader) {
return new Response(
JSON.stringify({ error: "Not authenticated" }),
{
status: 401,
headers: { "Content-Type": "application/json" },
}
);
}

const userClient = createClient(
Deno.env.get("SUPABASE_URL")!,
Deno.env.get("SUPABASE_ANON_KEY")!,
{
global: {
headers: {
Authorization: authHeader,
},
},
}
);

const {
data: { user },
error: userError,
} = await userClient.auth.getUser();

if (userError || !user) {
return new Response(
JSON.stringify({ error: "Invalid authentication" }),
{
status: 401,
headers: { "Content-Type": "application/json" },
}
);
}

// Return existing address if this user already has one.
const { data: existing, error: existingError } =
await supabase
.from("wallet_deposit_addresses")
.select("address, network")
.eq("user_id", user.id)
.eq("network", "TRC20")
.maybeSingle();

if (existingError) {
throw existingError;
}

if (existing) {
return new Response(
JSON.stringify({
address: existing.address,
network: existing.network,
}),
{
status: 200,
headers: { "Content-Type": "application/json" },
}
);
}

// Generate a real TRON wallet.
const account = await tronWeb.createAccount();

const address = account.address.base58;
const privateKey = account.privateKey;

/*
IMPORTANT:
Do NOT store the private key as plaintext.

For the first test, we stop here rather than putting
an unencrypted private key into the database.
*/

return new Response(
JSON.stringify({
address,
network: "TRC20",
warning: "Address generated. Private-key encryption must be configured before production storage.",
}),
{
status: 200,
headers: { "Content-Type": "application/json" },
}
);

} catch (error) {
console.error(error);

return new Response(
JSON.stringify({
error: "Could not create TRON address",
}),
{
status: 500,
headers: { "Content-Type": "application/json" },
}
);

}
});