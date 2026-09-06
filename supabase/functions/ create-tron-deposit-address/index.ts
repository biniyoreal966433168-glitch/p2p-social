import { createClient } from "npm:@supabase/supabase-js@2";
import { TronWeb } from "npm:tronweb@6";

/* =====================================================
CONFIG
===================================================== */

const SUPABASE_URL =
  "https://mbsvuwrgigqfporxwpfr.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_iclqtQHDwK5IEve0cNjrgQ_CdUDCuBa";

const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const TRONGRID_API_KEY =
  Deno.env.get("TRONGRID_API_KEY");

/* =====================================================
SUPABASE SERVICE CLIENT
===================================================== */

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "SUPABASE_SERVICE_ROLE_KEY is missing."
  );
}

const supabase =
  createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY || ""
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
        TRONGRID_API_KEY || "",
    },
  });

/* =====================================================
CORS
===================================================== */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",

  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",

  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
};

/* =====================================================
RESPONSE
===================================================== */

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

        return response(
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

        return response(
          {
            success: false,

            error:
              "POST required.",
          },
          405
        );

      }

      /* =================================================
      REQUIRED SECRETS
      ================================================= */

      if (
        !SUPABASE_SERVICE_ROLE_KEY
      ) {

        console.error(
          "Missing SUPABASE_SERVICE_ROLE_KEY"
        );

        return response(
          {
            success: false,

            error:
              "Server configuration error: SUPABASE_SERVICE_ROLE_KEY is missing.",
          },
          500
        );

      }

      if (
        !TRONGRID_API_KEY
      ) {

        console.error(
          "Missing TRONGRID_API_KEY"
        );

        return response(
          {
            success: false,

            error:
              "Server configuration error: TRONGRID_API_KEY is missing.",
          },
          500
        );

      }

      /* =================================================
      AUTHORIZATION
      ================================================= */

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
            success: false,

            error:
              "Not authenticated.",
          },
          401
        );

      }

      const accessToken =
        authHeader.substring(
          "Bearer ".length
        ).trim();

      if (!accessToken) {

        return response(
          {
            success: false,

            error:
              "Missing access token.",
          },
          401
        );

      }

      /* =================================================
      VERIFY USER
      ================================================= */

      const userClient =
        createClient(
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
        data: userData,
        error: userError,
      } =
        await userClient.auth.getUser(
          accessToken
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
            success: false,

            error:
              "Invalid authentication.",
          },
          401
        );

      }

      const userId =
        userData.user.id;

      /* =================================================
      OPTIONAL REQUEST BODY
      ================================================= */

      let body:
        Record<string, unknown> = {};

      try {

        body =
          await req.json();

      } catch {

        body = {};

      }

      /*
      Only accept the supported network/token/standard.
      The values are fixed server-side.
      */

      const requestedNetwork =
        String(
          body?.network ||
          "TRON"
        ).toUpperCase();

      const requestedToken =
        String(
          body?.token ||
          "USDT"
        ).toUpperCase();

      const requestedStandard =
        String(
          body?.standard ||
          "TRC-20"
        ).toUpperCase();

      if (
        requestedNetwork !==
        "TRON"
      ) {

        return response(
          {
            success: false,

            error:
              "Only TRON network is supported.",
          },
          400
        );

      }

      if (
        requestedToken !==
        "USDT"
      ) {

        return response(
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
        "TRC-20"
      ) {

        return response(
          {
            success: false,

            error:
              "Only TRC-20 is supported.",
          },
          400
        );

      }

      /* =================================================
      CHECK EXISTING ADDRESS
      ================================================= */

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
          "DATABASE CHECK ERROR:",
          existingError
        );

        return response(
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

      if (existing) {

        return response(
          {
            success: true,

            existing: true,

            address:
              existing.address,

            network:
              "TRON",

            token:
              "USDT",

            standard:
              "TRC-20",
          },
          200
        );

      }

      /* =================================================
      GENERATE TRON ADDRESS
      ================================================= */

      const account =
        await tronWeb.createAccount();

      const address =
        account.address.base58;

      /*
      IMPORTANT:
      The private key is intentionally NOT returned
      to the frontend.
      */

      console.log(
        "Generated TRON deposit address:",
        address
      );

      /* =================================================
      VALIDATE ADDRESS
      ================================================= */

      const isValid =
        tronWeb.isAddress(
          address
        );

      if (!isValid) {

        console.error(
          "Generated invalid TRON address:",
          address
        );

        return response(
          {
            success: false,

            error:
              "Generated TRON address is invalid.",
          },
          500
        );

      }

      /* =================================================
      SAVE ADDRESS
      ================================================= */

      const {
        data: savedWallet,
        error: saveError,
      } =
        await supabase
          .from(
            "wallet_deposit_addresses"
          )
          .insert(
            {
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
            }
          )
          .select(
            "id,address,network,token,standard,is_active"
          )
          .single();

      if (saveError) {

        /*
        Another request could theoretically create
        the address first. Try to return the existing
        active address if that happens.
        */

        console.error(
          "SAVE WALLET ERROR:",
          saveError
        );

        const {
          data: existingAfterInsert,
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

        if (
          existingAfterInsert
        ) {

          return response(
            {
              success: true,

              existing: true,

              address:
                existingAfterInsert.address,

              network:
                "TRON",

              token:
                "USDT",

              standard:
                "TRC-20",
            },
            200
          );

        }

        return response(
          {
            success: false,

            error:
              "Could not save TRON deposit address.",

            details:
              saveError.message,
          },
          500
        );

      }

      /* =================================================
      SUCCESS
      ================================================= */

      return response(
        {
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
            "Send only USDT on TRON / TRC-20 to this address.",
        },
        200
      );

    } catch (error) {

      console.error(
        "CREATE TRON ADDRESS ERROR:",
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : String(error);

      return response(
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