export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const wallet_address = req.query.wallet_address;
    const order_amount = req.query.order_amount;

    if (!wallet_address) {
      return res.status(400).json({
        error: "TON wallet address required"
      });
    }

    if (!order_amount) {
      return res.status(400).json({
        error: "Order amount required"
      });
    }

    const amount = Number(order_amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        error: "Invalid order amount"
      });
    }

    const fee = amount * 0.01;

    const TONAPI_KEY = process.env.TONAPI_KEY;

    if (!TONAPI_KEY) {
      return res.status(500).json({
        error: "TONAPI_KEY is not configured"
      });
    }

    const platform_wallet =
      "UQACkUS0J6lEIlo6iHWoAjxnUYoOOR4StNPVbTXDOt-Em1zl";

    const usdt_master =
      "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";

    const balanceUrl =
      "https://tonapi.io/v2/accounts/" +
      encodeURIComponent(wallet_address) +
      "/jettons/" +
      encodeURIComponent(usdt_master);

    const balanceResponse = await fetch(balanceUrl, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + TONAPI_KEY
      }
    });

    const balanceData = await balanceResponse.json();

    if (!balanceResponse.ok) {
      return res.status(balanceResponse.status).json({
        error: "TON API error",
        details: balanceData
      });
    }

    const rawBalance = String(balanceData.balance || "0");
    const walletUsdtBalance = Number(rawBalance) / 1000000;

    if (walletUsdtBalance < fee) {
      return res.status(400).json({
        success: false,
        error: "Insufficient USDT balance for Create Order fee",
        order_amount: amount,
        fee_percent: 1,
        fee_amount: fee,
        wallet_usdt_balance: walletUsdtBalance,
        platform_wallet: platform_wallet
      });
    }

    return res.status(200).json({
      success: true,
      fee_type: "create_order",
      fee_percent: 1,
      order_amount: amount,
      fee_amount: fee,
      fee_raw: Math.round(fee * 1000000),
      wallet_address: wallet_address,
      platform_wallet: platform_wallet,
      usdt_master: usdt_master,
      wallet_usdt_balance: walletUsdtBalance
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}