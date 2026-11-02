export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const expectedAddress = "UQAShr7BUomDblYvGCTXYqZaxwXt0IA7c8fFJy2Fc31v6NfO";
    const usdtMaster = "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";
    const address = String(req.query.address || "").trim();

    if (address !== expectedAddress) {
      return res.status(403).json({ success: false, error: "Address not authorized" });
    }

    const apiKey = process.env.TONAPI_KEY;
    if (!apiKey) {
      return res.status(500).json({ success: false, error: "TONAPI_KEY is not configured" });
    }

    const url =
      "https://tonapi.io/v2/accounts/" +
      encodeURIComponent(expectedAddress) +
      "/jettons/" +
      encodeURIComponent(usdtMaster);

    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: "Bearer " + apiKey, Accept: "application/json" }
    });

    if (response.status === 404) {
      return res.status(200).json({ success: true, balance: 0, currency: "USDT" });
    }

    const data = await response.json();
    if (!response.ok) {
      return res.status(502).json({
        success: false,
        error: "TON API balance lookup failed",
        details: data
      });
    }

    const rawBalance = Number(data?.balance ?? 0);
    const decimals = Number(data?.jetton?.decimals ?? 6);
    if (!Number.isFinite(rawBalance) || rawBalance < 0 ||
        !Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
      return res.status(502).json({ success: false, error: "Invalid USDT balance response" });
    }

    return res.status(200).json({
      success: true,
      balance: rawBalance / Math.pow(10, decimals),
      currency: "USDT",
      address: expectedAddress
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error?.message || "Unable to load admin USDT balance"
    });
  }
}
