export default async function handler(req, res) {
  try {
    const address =
      req.query.address || "TPGKiCHwQubH7CtRysAzEGAm1tWkFNfxex";

    // Basic TRON address check
    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) {
      return res.status(400).json({
        success: false,
        error: "Invalid TRON address"
      });
    }

    const apiKey = process.env.TRONGRID_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "TRONGRID_API_KEY is not configured"
      });
    }

    // TRON mainnet USDT contract
    const USDT_CONTRACT =
      "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj";

    const url =
      `https://api.trongrid.io/v1/accounts/${address}/trc20/balance` +
      `?contract_address=${USDT_CONTRACT}`;

    const response = await fetch(url, {
      headers: {
        "TRON-PRO-API-KEY": apiKey
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: data
      });
    }

    const token = Array.isArray(data.data)
      ? data.data.find(
          item =>
            item.token_info?.address === USDT_CONTRACT
        )
      : null;

    const rawBalance = token?.balance || "0";

    // TRC-20 USDT uses 6 decimals
    const balance = Number(rawBalance) / 1_000_000;

    return res.status(200).json({
      success: true,
      address,
      usdt: balance,
      rawBalance
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}