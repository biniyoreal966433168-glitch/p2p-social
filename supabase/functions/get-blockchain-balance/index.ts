import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
SUPABASE
===================================================== */

const SUPABASE_URL =
  "https://mbsvuwrgigqfporxwpfr.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_iclqtQHDwK5IEve0cNjrgQ_CdUDCuBa";

/*
IMPORTANT:
These are environment-variable NAMES.
The real secret values must be stored in
Supabase Edge Function Secrets.
*/

const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get(
    "SUPABASE_SERVICE_ROLE_KEY"
  );

const TRONGRID_API_KEY =
  Deno.env.get(
    "TRONGRID_API_KEY"
  );

/* =====================================================
TRON
===================================================== */

const TRONGRID_BASE_URL =
  "https://api.trongrid.io";

const USDT_CONTRACT =
  "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj";

const USDT_DECIMALS = 6;

/* =====================================================
RESPONSE
===================================================== */

function jsonResponse(
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
TRON ADDRESS VALIDATION
===================================================== */

function isValidTronAddress(
  address: string
) {

  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(
    address
  );

}

/* =====================================================
RAW USDT → DECIMAL
===================================================== */

function convertUsdtRawAmount(
  rawAmount: unknown
) {

  const raw =
    String(
      rawAmount ?? "0"
    ).trim();

  if (!/^\d+$/.test(raw)) {
    return null;
  }

  const length =
    raw.length;

  if (
    length <=
    USDT_DECIMALS
  ) {

    const padded =
      raw.padStart(
        USDT_DECIMALS + 1,
        "0"
      );

    const integerPart =
      padded.slice(
        0,
        padded.length -
          USDT_DECIMALS
      );

    const decimalPart =
      padded.slice(
        padded.length -
          USDT_DECIMALS
      );

    return Number(
      `${integerPart}.${decimalPart}`
    );

  }

  const integerPart =
    raw.slice(
      0,
      length -
        USDT_DECIMALS
    );

  const decimalPart =
    raw.slice(
      length -
        USDT_DECIMALS
    );

  return Number(
    `${integerPart}.${decimalPart}`
  );

}

/* =====================================================
FIND USDT
===================================================== */

function findUsdtBalance(
  data: unknown
) {

  if (
    !Array.isArray(data)
  ) {
    return null;
  }

  for (
    const token of data
  ) {

    if (
      !token ||
      typeof token !==
        "object"
    ) {
      continue;
    }

    const item =
      token as Record<
        string,
        unknown
      >;

    const contract =
      String(
        item.contract_address ??
        item.contractAddress ??
        ""
      ).trim();

    if (
      contract.toLowerCase() !==
      USDT_CONTRACT.toLowerCase()
    ) {
      continue;
    }

    const rawBalance =
      item.balance ??
      item.amount ??
      item.value ??
      "0";

    const balance =
      convertUsdtRawAmount(
        rawBalance
      );

    if (
      balance === null ||
      !Number.isFinite(
        balance
      )
    ) {

      return null;

    }

    return balance;

  }

  /*
  Address is valid but has no USDT.
  */

  return 0;

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

        return new Response(
          "ok",
          {
            status: 200,
            headers:
              corsHeaders,
          }
        );

      }

      /* =================================================
      METHOD
      ================================================= */

      if (
        req.method !==
        "POST"
      ) {

        return jsonResponse(
          {
            success: false,

            error:
              "Method not allowed.",
          },
          405
        );

      }

      /* =================================================
      SERVER CONFIG
      ================================================= */

      if (
        !SUPABASE_SERVICE_ROLE_KEY
      ) {

        console.error(
          "SUPABASE_SERVICE_ROLE_KEY is missing."
        );

        return jsonResponse(
          {
            success: false,

            error:
              "Supabase server configuration is incomplete.",
          },
          500
        );

      }

      if (
        !TRONGRID_API_KEY
      ) {

        console.error(
          "TRONGRID_API_KEY is missing."
        );

        return jsonResponse(
          {
            success: false,

            error:
              "TRON backend configuration is incomplete.",
          },
          500
        );

      }

      /* =================================================
      AUTH HEADER
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

        return jsonResponse(
          {
            success: false,

            error:
              "Authentication required.",
          },
          401
        );

      }

      const accessToken =
        authHeader
          .replace(
            "Bearer ",
            ""
          )
          .trim();

      if (!accessToken) {

        return jsonResponse(
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

        return jsonResponse(
          {
            success: false,

            error:
              "Invalid or expired login session.",
          },
          401
        );

      }

      const userId =
        userData.user.id;

      /* =================================================
      ADMIN CLIENT
      ================================================= */

      const adminClient =
        createClient(
          SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY,
          {
            auth: {
              autoRefreshToken:
                false,

              persistSession:
                false,
            },
          }
        );

      /* =================================================
      FIND USER DEPOSIT ADDRESS
      ================================================= */

      const {
        data: wallet,
        error: walletError,
      } =
        await adminClient
          .from(
            "wallet_deposit_addresses"
          )
          .select(
            "id,user_id,address,network,token,standard,is_active"
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

      if (walletError) {

        console.error(
          "WALLET ADDRESS ERROR:",
          walletError
        );

        return jsonResponse(
          {
            success: false,

            error:
              "Could not load your assigned deposit address.",
          },
          500
        );

      }

      /* =================================================
      NO ADDRESS
      ================================================= */

      if (!wallet) {

        return jsonResponse(
          {
            success: false,

            error:
              "No active TRC-20 deposit address is assigned to this user.",
          },
          404
        );

      }

      /* =================================================
      ADDRESS
      ================================================= */

      const address =
        String(
          wallet.address ??
          ""
        ).trim();

      const network =
        String(
          wallet.network ??
          ""
        )
          .trim()
          .toUpperCase();

      const token =
        String(
          wallet.token ??
          ""
        )
          .trim()
          .toUpperCase();

      const standard =
        String(
          wallet.standard ??
          ""
        )
          .trim()
          .toUpperCase();

      /* =================================================
      VALIDATE NETWORK
      ================================================= */

      if (
        network !==
        "TRON"
      ) {

        return jsonResponse(
          {
            success: false,

            error:
              "Assigned wallet is not a TRON wallet.",
          },
          400
        );

      }

      if (
        token !==
        "USDT"
      ) {

        return jsonResponse(
          {
            success: false,

            error:
              "Assigned wallet is not configured for USDT.",
          },
          400
        );

      }

      if (
        standard !==
        "TRC-20"
      ) {

        return jsonResponse(
          {
            success: false,

            error:
              "Assigned wallet is not configured for TRC-20.",
          },
          400
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

        return jsonResponse(
          {
            success: false,

            error:
              "Assigned deposit address is not a valid TRON address.",
          },
          400
        );

      }

      /* =================================================
      TRONGRID REQUEST
      ================================================= */

      const tronUrl =
        new URL(
          `${TRONGRID_BASE_URL}/v1/accounts/${encodeURIComponent(
            address
          )}/trc20/balance`
        );

      tronUrl.searchParams.set(
        "contract_address",
        USDT_CONTRACT
      );

      tronUrl.searchParams.set(
        "limit",
        "20"
      );

      let tronResponse: Response;

      try {

        tronResponse =
          await fetch(
            tronUrl.toString(),
            {
              method:
                "GET",

              headers: {
                "TRON-PRO-API-KEY":
                  TRONGRID_API_KEY,

                Accept:
                  "application/json",
              },
            }
          );

      } catch (error) {

        console.error(
          "TRONGRID NETWORK ERROR:",
          error
        );

        return jsonResponse(
          {
            success: false,

            error:
              "Unable to connect to the TRON blockchain service.",
          },
          502
        );

      }

      /* =================================================
      TRONGRID STATUS
      ================================================= */

      if (
        !tronResponse.ok
      ) {

        const errorBody =
          await tronResponse.text();

        console.error(
          "TRONGRID ERROR:",
          tronResponse.status,
          errorBody
        );

        return jsonResponse(
          {
            success: false,

            error:
              "TRON blockchain lookup failed.",
          },
          502
        );

      }

      /* =================================================
      PARSE TRONGRID
      ================================================= */

      let tronData: unknown;

      try {

        tronData =
          await tronResponse.json();

      } catch (error) {

        console.error(
          "TRONGRID JSON ERROR:",
          error
        );

        return jsonResponse(
          {
            success: false,

            error:
              "Invalid response from TRON blockchain service.",
          },
          502
        );

      }

      /* =================================================
      RESPONSE DATA
      ================================================= */

      const responseObject =
        tronData &&
        typeof tronData ===
          "object"
          ? (
              tronData as Record<
                string,
                unknown
              >
            )
          : null;

      const balances =
        responseObject?.data;

      const usdtBalance =
        findUsdtBalance(
          balances
        );

      /* =================================================
      BALANCE PARSE ERROR
      ================================================= */

      if (
        usdtBalance === null
      ) {

        console.error(
          "Could not parse USDT balance:",
          tronData
        );

        return jsonResponse(
          {
            success: false,

            error:
              "Could not read the USDT balance returned by TRON.",
          },
          502
        );

      }

      /* =================================================
      SUCCESS
      ================================================= */

      return jsonResponse(
        {
          success: true,

          address:

            address,

          network:
            "TRON",

          token:
            "USDT",

          standard:
            "TRC-20",

          contract_address:
            USDT_CONTRACT,

          decimals:
            USDT_DECIMALS,

          usdt_balance:
            usdtBalance,

          blockchain_balance:
            usdtBalance,

          verified:
            true,

          source:
            "TronGrid",

          checked_at:
            new Date().toISOString(),
        },
        200
      );

    } catch (error) {

      console.error(
        "GET BLOCKCHAIN BALANCE ERROR:",
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : String(error);

      return jsonResponse(
        {
          success: false,

          error:
            "Could not read TRON blockchain balance.",

          details:
            message,
        },
        500
      );

    }

  }
);