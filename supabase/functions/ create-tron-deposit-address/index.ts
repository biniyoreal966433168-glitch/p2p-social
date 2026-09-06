import { createClient } from "npm:@supabase/supabase-js@2";
import { TronWeb } from "npm:tronweb@6";

const SUPABASE_URL =
  "https://mbsvuwrgigqfporxwpfr.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_iclqtQHDwK5IEve0cNjrgQ_CdUDCuBa";

const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const TRONGRID_API_KEY =
  Deno.env.get("TRONGRID_API_KEY") ??
  "8978e772-a3b2-4db3-b9c9-3feff764c5f5";

const TRON_NETWORK = "TRON";
const USDT_ASSET = "USDT";
const TRC20_STANDARD = "TRC-20";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
  "Content-Type": "application/json",
};

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

const tronWeb = new TronWeb({
  fullHost: "https://api.trongrid.io",
  headers: {
    "TRON-PRO-API-KEY":
      TRONGRID_API_KEY,
  },
});

function json(
  body: unknown,
  status = 200
): Response {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: corsHeaders,
    }
  );
}

function isValidTronAddress(
  address: string
): boolean {
  return (
    /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(
      address
    ) &&
    tronWeb.isAddress(address)
  );
}

async function getAuthenticatedUser(
  req: Request
) {
  const authHeader =
    req.headers.get("Authorization");

  if (
    !authHeader ||
    !authHeader.startsWith("Bearer ")
  ) {
    return null;
  }

  const accessToken =
    authHeader
      .replace(/^Bearer\s+/i, "")
      .trim();

  if (!accessToken) {
    return null;
  }

  const userClient = createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      global: {
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },
      },
    }
  );

  const {
    data,
    error,
  } =
    await userClient.auth.getUser(
      accessToken
    );

  if (error || !data?.user) {
    return null;
  }

  return data.user;
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return json({
        success: true,
      });
    }

    if (req.method !== "POST") {
      return json(
        {
          success: false,
          error: "POST required.",
        },
        405
      );
    }

    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return json(
        {
          success: false,
          error:
            "SUPABASE_SERVICE_ROLE_KEY is missing.",
        },
        500
      );
    }

    if (!TRONGRID_API_KEY) {
      return json(
        {
          success: false,
          error:
            "TRONGRID_API_KEY is missing.",
        },
        500
      );
    }

    const user =
      await getAuthenticatedUser(req);

    if (!user) {
      return json(
        {
          success: false,
          error:
            "Invalid authentication.",
        },
        401
      );
    }

    let body:
      Record<string, unknown> = {};

    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const network =
      String(
        body.network ??
          TRON_NETWORK
      )
        .trim()
        .toUpperCase();

    const asset =
      String(
        body.asset ??
          body.token ??
          USDT_ASSET
      )
        .trim()
        .toUpperCase();

    const standard =
      String(
        body.standard ??
          TRC20_STANDARD
      )
        .trim()
        .toUpperCase();

    if (network !== TRON_NETWORK) {
      return json(
        {
          success: false,
          error:
            "Only TRON network is supported.",
        },
        400
      );
    }

    if (asset !== USDT_ASSET) {
      return json(
        {
          success: false,
          error:
            "Only USDT is supported.",
        },
        400
      );
    }

    if (standard !== TRC20_STANDARD) {
      return json(
        {
          success: false,
          error:
            "Only TRC-20 is supported.",
        },
        400
      );
    }

    const {
      data: existing,
      error: existingError,
    } =
      await supabase
        .from("deposit_addresses")
        .select(
          "id,user_id,blockchain,network,asset,deposit_address,status,created_at,updated_at"
        )
        .eq(
          "user_id",
          user.id
        )
        .eq(
          "blockchain",
          TRON_NETWORK
        )
        .eq(
          "network",
          TRON_NETWORK
        )
        .eq(
          "asset",
          USDT_ASSET
        )
        .eq(
          "status",
          "active"
        )
        .order(
          "created_at",
          {
            ascending: false,
          }
        )
        .limit(1)
        .maybeSingle();

    if (existingError) {
      return json(
        {
          success: false,
          error:
            "Could not check existing deposit address.",
          details:
            existingError.message,
        },
        500
      );
    }

    if (
      existing?.deposit_address &&
      isValidTronAddress(
        existing.deposit_address
      )
    ) {
      return json({
        success: true,
        existing: true,
        id: existing.id,
        user_id: existing.user_id,
        address:
          existing.deposit_address,
        deposit_address:
          existing.deposit_address,
        wallet_address:
          existing.deposit_address,
        blockchain:
          existing.blockchain,
        network:
          existing.network,
        asset:
          existing.asset,
        token:
          existing.asset,
        standard:
          TRC20_STANDARD,
        status:
          existing.status,
        created_at:
          existing.created_at,
        updated_at:
          existing.updated_at,
      });
    }

    const account =
      await tronWeb.createAccount();

    const address =
      account?.address?.base58;

    const privateKey =
      account?.privateKey;

    if (
      !address ||
      !privateKey
    ) {
      return json(
        {
          success: false,
          error:
            "TRON wallet generation failed.",
        },
        500
      );
    }

    if (
      !isValidTronAddress(address)
    ) {
      return json(
        {
          success: false,
          error:
            "Generated TRON address is invalid.",
        },
        500
      );
    }

    const {
      data: saved,
      error: insertError,
    } =
      await supabase
        .from("deposit_addresses")
        .insert({
          user_id:
            user.id,
          blockchain:
            TRON_NETWORK,
          network:
            TRON_NETWORK,
          asset:
            USDT_ASSET,
          deposit_address:
            address,
          status:
            "active",
        })
        .select(
          "id,user_id,blockchain,network,asset,deposit_address,status,created_at,updated_at"
        )
        .single();

    if (insertError) {
      return json(
        {
          success: false,
          error:
            "Could not save TRON deposit address.",
          details:
            insertError.message,
        },
        500
      );
    }

    void privateKey;

    return json({
      success: true,
      existing: false,
      id: saved.id,
      user_id: saved.user_id,
      address:
        saved.deposit_address,
      deposit_address:
        saved.deposit_address,
      wallet_address:
        saved.deposit_address,
      blockchain:
        saved.blockchain,
      network:
        saved.network,
      asset:
        saved.asset,
      token:
        saved.asset,
      standard:
        TRC20_STANDARD,
      status:
        saved.status,
      created_at:
        saved.created_at,
      updated_at:
        saved.updated_at,
      warning:
        "Send only USDT on TRON / TRC-20 to this address.",
    });
  } catch (error) {
    console.error(
      "CREATE TRON DEPOSIT ADDRESS ERROR:",
      error
    );

    return json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not create TRON deposit address.",
      },
      500
    );
  }
});