export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const address = req.query.address;

    if (!address) {
      return res.status(400).json({ error: "TON address required" });
    }

    const apiKey = process.env.TONAPI_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "TONAPI_KEY is not configured" });
    }

    const usdtMaster =
      "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";

    const url =
      "https://tonapi.io/v2/accounts/" +
      encodeURIComponent(address) +
      "/jettons/" +
      encodeURIComponent(usdtMaster);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + apiKey
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "TON API error",
        details: data
      });
    }

    const rawBalance = String(data.balance || "0");

    const balance = Number(rawBalance) / 1000000;

    return res.status(200).json({
      address: address,
      usdt_balance: balance
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}