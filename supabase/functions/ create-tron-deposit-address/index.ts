import { createClient } from "npm:@supabase/supabase-js@2";
import { TronWeb } from "npm:tronweb@6";

const SUPABASE_URL =
  "https://mbsvuwrgigqfporxwpfr.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_iclqtQHDwK5IEve0cNjrgQ_CdUDCuBa";

const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const TRONGRID_API_KEY =
  Deno.env.get("TRONGRID_API_KEY");

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY!
);

const tronWeb = new TronWeb({
  fullHost: "https://api.trongrid.io",
  headers: {
    "TRON-PRO-API-KEY":
      TRONGRID_API_KEY || "",
  },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
};

function response(
  body: unknown,
  status = 200
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type":
          "application/json",
      },
    }
  );
}

Deno.serve(async (req) => {
  try {

    if (req.method === "OPTIONS") {
      return response(
        { success: true },
        200
      );
    }

    if (req.method !== "POST") {
      return response(
        {
          error:
            "POST required",
        },
        405
      );
    }

    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return response(
        {
          error:
            "Missing SUPABASE_SERVICE_ROLE_KEY",
        },
        500
      );
    }

    if (!TRONGRID_API_KEY) {
      return response(
        {
          error:
            "Missing TRONGRID_API_KEY",
        },
        500
      );
    }

    const authHeader =
      req.headers.get(
        "Authorization"
      );

    if (
      !authHeader ||
      !authHeader.startsWith(
        "Bearer "
      )
    ) {
      return response(
        {
          error:
            "Not authenticated",
        },
        401
      );
    }

    const userClient =
      createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY,
        {
          global: {
            headers: {
              Authorization:
                authHeader,
            },
          },
        }
      );

    const {
      data: userData,
      error: userError,
    } =
      await userClient.auth.getUser(
        authHeader.replace(
          "Bearer ",
          ""
        )
      );

    if (
      userError ||
      !userData?.user
    ) {
      console.error(
        "AUTH ERROR:",
        userError
      );

      return response(
        {
          error:
            "Invalid authentication",
        },
        401
      );
    }

    const userId =
      userData.user.id;

    /*
    ------------------------------------------------
    CHECK EXISTING ADDRESS
    ------------------------------------------------
    */

    const {
      data: existing,
      error: existingError,
    } =
      await supabase
        .from(
          "wallet_deposit_addresses"
        )
        .select(
          "id,address,network,token,standard,is_active"
        )
        .eq(
          "user_id",
          userId
        )
        .eq(
          "network",
          "TRON"
        )
        .eq(
          "token",
          "USDT"
        )
        .eq(
          "standard",
          "TRC-20"
        )
        .eq(
          "is_active",
          true
        )
        .maybeSingle();

    if (existingError) {
      console.error(
        "DATABASE ERROR:",
        existingError
      );

      return response(
        {
          error:
            "Could not check existing wallet.",
        },
        500
      );
    }

    if (existing) {
      return response({
        success: true,
        existing: true,
        address:
          existing.address,
        network:
          existing.network,
        token:
          existing.token,
        standard:
          existing.standard,
      });
    }

    /*
    ------------------------------------------------
    GENERATE NEW TRON ADDRESS
    ------------------------------------------------
    */

    const account =
      await tronWeb.createAccount();

    const address =
      account.address.base58;

    const privateKey =
      account.privateKey;

    /*
    ------------------------------------------------
    IMPORTANT SECURITY
    ------------------------------------------------

    The private key is NOT stored yet.

    Do NOT put privateKey into the
    database as plaintext.

    A secure encrypted custody system
    is required before real deposits
    are swept or withdrawn.
    */

    console.log(
      "New TRON address generated:",
      address
    );

    /*
    ------------------------------------------------
    SAVE ADDRESS
    ------------------------------------------------
    */

    const {
      data: savedWallet,
      error: saveError,
    } =
      await supabase
        .from(
          "wallet_deposit_addresses"
        )
        .insert({
          user_id:
            userId,

          address:
            address,

          network:
            "TRON",

          token:
            "USDT",

          standard:
            "TRC-20",

          is_active:
            true,
        })
        .select(
          "id,address,network,token,standard,is_active"
        )
        .single();

    if (saveError) {
      console.error(
        "SAVE WALLET ERROR:",
        saveError
      );

      return response(
        {
          error:
            "Could not save TRON deposit address.",
        },
        500
      );
    }

    /*
    ------------------------------------------------
    RETURN ADDRESS
    ------------------------------------------------
    */

    return response({
      success: true,

      existing: false,

      address:
        savedWallet.address,

      network:
        savedWallet.network,

      token:
        savedWallet.token,

      standard:
        savedWallet.standard,

      warning:
        "Address created and saved. Secure private-key custody is still required before production withdrawals or sweeping deposits.",
    });

  } catch (error) {

    console.error(
      "CREATE TRON ADDRESS ERROR:",
      error
    );

    return response(
      {
        error:
          "Could not create TRON address.",
      },
      500
    );
  }
});