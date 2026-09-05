import { createClient } from "npm:@supabase/supabase-js@2";
import { TronWeb } from "npm:tronweb";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  try {
    const auth = req.headers.get("Authorization");

    if (!auth) {
      return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: auth }
        }
      }
    );

    const {
      data: { user },
      error: authError
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid session" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Return existing address if the user already has one
    const { data: existing } = await supabase
      .from("wallet_deposit_addresses")
      .select("address, network")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({
          address: existing.address,
          network: existing.network
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Generate a new TRON wallet
    const wallet = TronWeb.createRandom();

    const address = wallet.address.base58;
    const privateKey = wallet.privateKey;

    // IMPORTANT:
    // Replace this with proper encryption/KMS before production.
    const encryptionSecret =
      Deno.env.get("DEPOSIT_KEY_ENCRYPTION_SECRET");

    if (!encryptionSecret) {
      throw new Error("Missing DEPOSIT_KEY_ENCRYPTION_SECRET");
    }

    const encryptedPrivateKey = await encrypt(
      privateKey,
      encryptionSecret
    );

    const { error: insertError } = await supabase
      .from("wallet_deposit_addresses")
      .insert({
        user_id: user.id,
        address,
        encrypted_private_key: encryptedPrivateKey,
        network: "TRC20"
      });

    if (insertError) {
      throw insertError;
    }

    return new Response(
      JSON.stringify({
        address,
        network: "TRC20"
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );

  } catch (error) {
    console.error(error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error
          ? error.message
          : "Failed to create deposit address"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
});


async function encrypt(
  text: string,
  secret: string
): Promise<string> {

  const keyMaterial = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret)
  );

  const key = await crypto.subtle.importKey(
    "raw",
    keyMaterial,
    "AES-GCM",
    false,
    ["encrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(text)
  );

  return JSON.stringify({
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(encrypted))
  });
}