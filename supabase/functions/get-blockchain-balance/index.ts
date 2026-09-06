import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
};

const SUPABASE_URL =
  "https://mbsvuwrgigqfporxwpfr.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_iclqtQHDwK5IEve0cNjrgQ_CdUDCuBa";

// KEEP THESE AS SUPABASE SECRETS.
// Do NOT insert the real values here.
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("sb_publishable_iclqtQHDwK5IEve0cNjrgQ_CdUDCuBa");

const TRONGRID_API_KEY =
  Deno.env.get("8978e772-a3b2-4db3-b9c9-3feff764c5f5");

const TRONGRID_BASE_URL =
  "https://api.trongrid.io";

const USDT_CONTRACT =
  "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj";

const USDT_DECIMALS = 6;

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
        "Content-Type": "application/json",
      },
    }
  );
}

function isValidTronAddress(
  address: string
) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(
    address
  );
}

function convertUsdtRawAmount(
  rawAmount: unknown
) {
  const raw = String(
    rawAmount ?? "0"
  );

  if (!/^\d+$/.test(raw)) {
    return null;
  }

  const length = raw.length;

  if (length <= USDT_DECIMALS) {
    const padded = raw.padStart(
      USDT_DECIMALS + 1,
      "0"
    );

    const integerPart = padded.slice(
      0,
      padded.length - USDT_DECIMALS
    );

    const decimalPart = padded.slice(
      padded.length - USDT_DECIMALS
    );

    return Number(
      `${integerPart}.${decimalPart}`
    );
  }

  const integerPart = raw.slice(
    0,
    length - USDT_DECIMALS
  );

  const decimalPart = raw.slice(
    length - USDT_DECIMALS
  );

  return Number(
    `${integerPart}.${decimalPart}`
  );
}

function findUsdtBalance(
  data: unknown
) {
  if (!Array.isArray(data)) {
    return null;
  }

  for (const token of data) {
    if (
      !token ||
      typeof token !== "object"
    ) {
      continue;
    }

    const item =
      token as Record<string, unknown>;

    const contract = String(
      item.contract_address ??
      item.contractAddress ??
      ""
    ).trim();

    if (
      contract !== USDT_CONTRACT
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
      !Number.isFinite(balance)
    ) {
      return null;
    }

    return balance;
  }

  return 0;
}

Deno.serve(
  async (req) => {

    if (
      req.method === "OPTIONS"
    ) {
      return new Response(
        "ok",
        {
          status: 200,
          headers: corsHeaders,
        }
      );
    }

    if (
      req.method !== "POST"
    ) {
      return jsonResponse(
        {
          error:
            "Method not allowed.",
        },
        405
      );
    }

    if (
      !SUPABASE_URL ||
      !SUPABASE_SERVICE_ROLE_KEY
    ) {
      return jsonResponse(
        {
          error:
            "Supabase server configuration is incomplete.",
        },
        500
      );
    }

    if (!TRONGRID_API_KEY) {
      return jsonResponse(
        {
          error:
            "TRON backend configuration is incomplete.",
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
      return jsonResponse(
        {
          error:
            "Authentication required.",
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

      return jsonResponse(
        {
          error:
            "Invalid or expired login session.",
        },
        401
      );
    }

    const userId =
      userData.user.id;

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
          error:
            "Could not load your assigned deposit address.",
        },
        500
      );
    }

    if (!wallet) {
      return jsonResponse(
        {
          error:
            "No active TRC-20 deposit address is assigned to this user.",
        },
        404
      );
    }

    const address =
      String(
        wallet.address ?? ""
      ).trim();

    const network =
      String(
        wallet.network ?? ""
      )
        .trim()
        .toUpperCase();

    const token =
      String(
        wallet.token ?? ""
      )
        .trim()
        .toUpperCase();

    const standard =
      String(
        wallet.standard ?? ""
      )
        .trim()
        .toUpperCase();

    if (network !== "TRON") {
      return jsonResponse(
        {
          error:
            "Assigned wallet is not a TRON wallet.",
        },
        400
      );
    }

    if (token !== "USDT") {
      return jsonResponse(
        {
          error:
            "Assigned wallet is not configured for USDT.",
        },
        400
      );
    }

    if (
      standard !== "TRC-20"
    ) {
      return jsonResponse(
        {
          error:
            "Assigned wallet is not configured for TRC-20.",
        },
        400
      );
    }

    if (
      !isValidTronAddress(
        address
      )
    ) {
      return jsonResponse(
        {
          error:
            "Assigned deposit address is not a valid TRON address.",
        },
        400
      );
    }

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
            method: "GET",
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
          error:
            "Unable to connect to the TRON blockchain service.",
        },
        502
      );
    }

    if (!tronResponse.ok) {
      const body =
        await tronResponse.text();

      console.error(
        "TRONGRID ERROR:",
        tronResponse.status,
        body
      );

      return jsonResponse(
        {
          error:
            "TRON blockchain lookup failed.",
        },
        502
      );
    }

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
          error:
            "Invalid response from TRON blockchain service.",
        },
        502
      );
    }

    const responseObject =
      tronData &&
      typeof tronData ===
        "object"
        ? tronData as Record<
            string,
            unknown
          >
        : null;

    const balances =
      responseObject?.data;

    const usdtBalance =
      findUsdtBalance(
        balances
      );

    if (
      usdtBalance === null
    ) {
      console.error(
        "Could not parse USDT balance:",
        tronData
      );

      return jsonResponse(
        {
          error:
            "Could not read the USDT balance returned by TRON.",
        },
        502
      );
    }

    return jsonResponse(
      {
        success: true,
        address,
        network: "TRON",
        token: "USDT",
        standard: "TRC-20",
        contract_address:
          USDT_CONTRACT,
        decimals:
          USDT_DECIMALS,
        usdt_balance:
          usdtBalance,
        blockchain_balance:
          usdtBalance,
        verified: true,
        source: "TronGrid",
        checked_at:
          new Date().toISOString(),
      },
      200
    );
  }
);