export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const {
      wallet_address,
      transaction_hash,
      fee_amount
    } = req.body || {};

    if (!wallet_address) {
      return res.status(400).json({
        error: "TON wallet address required"
      });
    }

    if (!transaction_hash) {
      return res.status(400).json({
        error: "Transaction hash required"
      });
    }

    if (!fee_amount) {
      return res.status(400).json({
        error: "Fee amount required"
      });
    }

    const fee = Number(fee_amount);

    if (!Number.isFinite(fee) || fee <= 0) {
      return res.status(400).json({
        error: "Invalid fee amount"
      });
    }

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

    const url =
      "https://tonapi.io/v2/blockchain/transactions/" +
      encodeURIComponent(transaction_hash);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + TONAPI_KEY
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "TON API error",
        details: data
      });
    }

    return res.status(200).json({
      success: true,
      verified: false,
      message: "Transaction found. Transfer verification will be completed from the transaction data.",
      wallet_address: wallet_address,
      transaction_hash: transaction_hash,
      expected_fee: fee,
      platform_wallet: platform_wallet,
      usdt_master: usdt_master,
      transaction: data
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}