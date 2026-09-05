import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    const authorization =
      req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "Authentication required"
      });
    }

    const accessToken =
      authorization.substring(7).trim();

    if (!accessToken) {
      return res.status(401).json({
        success: false,
        error: "Missing access token"
      });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    /*
     * Verify the logged-in Supabase user.
     */
    const {
      data: authData,
      error: authError
    } =
      await supabase.auth.getUser(
        accessToken
      );

    if (
      authError ||
      !authData?.user
    ) {
      return res.status(401).json({
        success: false,
        error: "Invalid or expired session"
      });
    }

    const userId =
      authData.user.id;

    /*
     * Get ONLY this user's assigned
     * TRON/TRC-20 deposit address.
     */
    const {
      data: wallet,
      error: walletError
    } =
      await supabase
        .from("wallet_deposit_addresses")
        .select(`
          id,
          user_id,
          address,
          network,
          token,
          standard,
          is_active
        `)
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
        "Wallet lookup error:",
        walletError
      );

      return res.status(500).json({
        success: false,
        error: "Could not load deposit wallet"
      });
    }

    if (!wallet) {
      return res.status(404).json({
        success: false,
        error: "No TRON deposit address assigned yet"
      });
    }

    const address =
      wallet.address;

    /*
     * Validate TRON address server-side.
     */
    if (
      !/^T[1-9A-HJ-NP-Za-km-z]{33}$/
        .test(address)
    ) {
      return res.status(500).json({
        success: false,
        error: "Stored deposit address is invalid"
      });
    }

    const apiKey =
      process.env.TRONGRID_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error:
          "TRONGRID_API_KEY is not configured"
      });
    }

    /*
     * TRON mainnet USDT TRC-20 contract.
     */
    const USDT_CONTRACT =
      "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj";

    const url =
      `https://api.trongrid.io/v1/accounts/${address}/trc20/balance` +
      `?contract_address=${USDT_CONTRACT}`;

    const response =
      await fetch(
        url,
        {
          method: "GET",
          headers: {
            "TRON-PRO-API-KEY":
              apiKey,
            "Accept":
              "application/json"
          }
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
      console.error(
        "TronGrid error:",
        data
      );

      return res.status(
        response.status
      ).json({
        success: false,
        error:
          "TronGrid request failed"
      });
    }

    const token =
      Array.isArray(data.data)
        ? data.data.find(
            item =>
              item.token_info?.address ===
              USDT_CONTRACT
          )
        : null;

    const rawBalance =
      token?.balance || "0";

    /*
     * TRC-20 USDT uses 6 decimals.
     */
    const balance =
      Number(rawBalance) /
      1_000_000;

    return res.status(200).json({
      success: true,

      wallet: {
        id: wallet.id,
        address: wallet.address,
        network: wallet.network,
        token: wallet.token,
        standard: wallet.standard,
        is_active: wallet.is_active
      },

      address,

      usdt: balance,

      rawBalance
    });

  } catch (error) {

    console.error(
      "TRON balance API error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error.message ||
        "Internal server error"
    });

  }
}