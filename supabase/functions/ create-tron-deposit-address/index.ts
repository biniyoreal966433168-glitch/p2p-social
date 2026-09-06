// supabase/functions/create-tron-deposit-address/index.ts

import { createClient } from "npm:@supabase/supabase-js@2";
import { TronWeb } from "npm:tronweb@6";

/* =====================================================
   CONFIG
===================================================== */

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ?? "";

const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const TRONGRID_API_KEY =
  Deno.env.get("TRONGRID_API_KEY") ?? "";

const TRON_NETWORK = "TRON";
const USDT_ASSET = "USDT";
const TRC20_STANDARD = "TRC-20";

/*
   IMPORTANT

   Your current deposit_addresses table does NOT have
   a "standard" column.

   Therefore standard is returned by the API but is NOT
   inserted into the database.
*/

/* =====================================================
   CORS
===================================================== */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
  "Content-Type": "application/json",
};

/* =====================================================
   SUPABASE SERVICE CLIENT
===================================================== */

if (!SUPABASE_URL) {
  console.error(
    "SUPABASE_URL is missing."
  );
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "SUPABASE_SERVICE_ROLE_KEY is missing."
  );
}

const supabase =
  createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
  );

/* =====================================================
   TRONWEB
===================================================== */

const tronWeb =
  new TronWeb({
    fullHost:
      "https://api.trongrid.io",

    headers: {
      "TRON-PRO-API-KEY":
        TRONGRID_API_KEY,
    },
  });

/* =====================================================
   RESPONSE HELPER
===================================================== */

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

/* =====================================================
   TRON ADDRESS VALIDATION
===================================================== */

function isValidTronAddress(
  address: string
): boolean {

  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(
    address
  );
}

/* =====================================================
   AUTHENTICATE USER
===================================================== */

async function authenticateUser(
  req: Request
) {

  const authHeader =
    req.headers.get(
      "Authorization"
    );

  if (!authHeader) {
    return {
      user: null,
      error:
        "Missing Authorization header.",
    };
  }

  const accessToken =
    authHeader.replace(
      /^Bearer\s+/i,
      ""
    ).trim();

  if (!accessToken) {
    return {
      user: null,
      error:
        "Missing access token.",
    };
  }

  const {
    data,
    error,
  } =
    await supabase.auth.getUser(
      accessToken
    );

  if (
    error ||
    !data?.user
  ) {

    console.error(
      "Authentication error:",
      error
    );

    return {
      user: null,
      error:
        "Invalid authentication.",
    };
  }

  return {
    user: data.user,
    error: null,
  };
}

/* =====================================================
   MAIN
===================================================== */

Deno.serve(
  async (req) => {

    try {

      /* =================================================
         OPTIONS
      ================================================= */

      if (
        req.method ===
        "OPTIONS"
      ) {

        return json(
          {
            success: true,
          },
          200
        );
      }

      /* =================================================
         METHOD
      ================================================= */

      if (
        req.method !==
        "POST"
      ) {

        return json(
          {
            success: false,
            error:
              "POST required.",
          },
          405
        );
      }

      /* =================================================
         SERVER CONFIGURATION
      ================================================= */

      if (!SUPABASE_URL) {

        return json(
          {
            success: false,
            error:
              "Server configuration error: SUPABASE_URL is missing.",
          },
          500
        );
      }

      if (
        !SUPABASE_SERVICE_ROLE_KEY
      ) {

        return json(
          {
            success: false,
            error:
              "Server configuration error: SUPABASE_SERVICE_ROLE_KEY is missing.",
          },
          500
        );
      }

      if (!TRONGRID_API_KEY) {

        return json(
          {
            success: false,
            error:
              "Server configuration error: TRONGRID_API_KEY is missing.",
          },
          500
        );
      }

      /* =================================================
         AUTHENTICATE USER
      ================================================= */

      const {
        user,
        error: authError,
      } =
        await authenticateUser(
          req
        );

      if (
        authError ||
        !user
      ) {

        return json(
          {
            success: false,
            error:
              authError ??
              "Unauthorized.",
          },
          401
        );
      }

      const userId =
        user.id;

      /* =================================================
         READ REQUEST BODY
      ================================================= */

      let body:
        Record<string, unknown> = {};

      try {

        body =
          await req.json();

      } catch {

        body = {};

      }

      /* =================================================
         VALIDATE REQUEST
      ================================================= */

      const requestedNetwork =
        String(
          body.network ??
          TRON_NETWORK
        )
          .trim()
          .toUpperCase();

      const requestedAsset =
        String(
          body.asset ??
          body.token ??
          USDT_ASSET
        )
          .trim()
          .toUpperCase();

      const requestedStandard =
        String(
          body.standard ??
          TRC20_STANDARD
        )
          .trim()
          .toUpperCase();

      if (
        requestedNetwork !==
        TRON_NETWORK
      ) {

        return json(
          {
            success: false,
            error:
              "Only TRON network is supported.",
          },
          400
        );
      }

      if (
        requestedAsset !==
        USDT_ASSET
      ) {

        return json(
          {
            success: false,
            error:
              "Only USDT is supported.",
          },
          400
        );
      }

      if (
        requestedStandard !==
        TRC20_STANDARD
      ) {

        return json(
          {
            success: false,
            error:
              "Only TRC-20 is supported.",
          },
          400
        );
      }

      /* =================================================
         CHECK EXISTING USER ADDRESS
      ================================================= */

      const {
        data: existing,
        error: existingError,
      } =
        await supabase
          .from(
            "deposit_addresses"
          )
          .select(
            "id,user_id,blockchain,network,asset,deposit_address,status,created_at,updated_at"
          )
          .eq(
            "user_id",
            userId
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

        console.error(
          "Existing address lookup error:",
          existingError
        );

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

      /* =================================================
         RETURN EXISTING ADDRESS
      ================================================= */

      if (
        existing?.deposit_address &&
        isValidTronAddress(
          existing.deposit_address
        )
      ) {

        return json(
          {
            success: true,

            existing: true,

            id:
              existing.id,

            user_id:
              existing.user_id,

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
          },
          200
        );
      }

      /* =================================================
         GENERATE NEW TRON ACCOUNT
      ================================================= */

      console.log(
        "Generating new TRON deposit address for user:",
        userId
      );

      const account =
        await tronWeb.createAccount();

      /* =================================================
         EXTRACT ADDRESS
      ================================================= */

      const address =
        account?.address?.base58;

      if (
        !address ||
        typeof address !==
          "string"
      ) {

        console.error(
          "TRON account did not return a valid address."
        );

        return json(
          {
            success: false,
            error:
              "TRON address generation failed.",
          },
          500
        );
      }

      /* =================================================
         VALIDATE ADDRESS
      ================================================= */

      if (
        !isValidTronAddress(
          address
        )
      ) {

        console.error(
          "Generated invalid TRON address:",
          address
        );

        return json(
          {
            success: false,
            error:
              "Generated TRON address is invalid.",
          },
          500
        );
      }

      /*
        Also verify with TronWeb.
      */

      if (
        !tronWeb.isAddress(
          address
        )
      ) {

        console.error(
          "TronWeb rejected generated address:",
          address
        );

        return json(
          {
            success: false,
            error:
              "TRON address validation failed.",
          },
          500
        );
      }

      /* =================================================
         PRIVATE KEY HANDLING
      =================================================

      IMPORTANT:

      account.privateKey is sensitive.

      NEVER return it to wallet.html.
      NEVER log it.
      NEVER put it in the deposit_addresses table.

      The generated address is only usable by your
      backend if the corresponding private key is stored
      securely.

      This function therefore requires a server-side
      private-key storage mechanism before production
      deposits are enabled.
      */

      const privateKey =
        account?.privateKey;

      if (
        !privateKey ||
        typeof privateKey !==
          "string"
      ) {

        console.error(
          "TRON account private key was not generated."
        );

        return json(
          {
            success: false,
            error:
              "TRON wallet generation failed because no private key was returned.",
          },
          500
        );
      }

      /*
        SECURITY:

        Do NOT console.log privateKey.
      */

      console.log(
        "TRON deposit address generated successfully:",
        address
      );

      /* =================================================
         SAVE PUBLIC ADDRESS
      ================================================= */

      const {
        data: saved,
        error: insertError,
      } =
        await supabase
          .from(
            "deposit_addresses"
          )
          .insert(
            {
              user_id:
                userId,

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
            }
          )
          .select(
            "id,user_id,blockchain,network,asset,deposit_address,status,created_at,updated_at"
          )
          .single();

      if (insertError) {

        console.error(
          "Deposit address database insert error:",
          insertError
        );

        /*
          IMPORTANT:

          At this point a TRON account was generated.

          Its private key must be securely preserved if
          the address has ever been exposed or used.

          Do NOT return the private key.
        */

        return json(
          {
            success: false,

            error:
              "Could not save the generated TRON deposit address.",

            details:
              insertError.message,
          },
          500
        );
      }

      /* =================================================
         SUCCESS
      ================================================= */

      return json(
        {
          success: true,

          existing: false,

          id:
            saved.id,

          user_id:
            saved.user_id,

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
        },
        200
      );

    } catch (error) {

      console.error(
        "CREATE TRON DEPOSIT ADDRESS ERROR:",
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : String(error);

      return json(
        {
          success: false,

          error:
            "Could not create TRON deposit address.",

          details:
            message,
        },
        500
      );
    }
  }
);