export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const address = "UQCt8Gf5ZHPmoXW_d6x0Ttt551tIg-KJZSx1CsSIIwE8NYUv";
  try {
    const response = await fetch(
      "https://toncenter.com/api/v2/getAddressBalance?address=" + encodeURIComponent(address),
      { method: "GET", headers: { Accept: "application/json" } }
    );
    const data = await response.json();
    if (!response.ok || data?.ok !== true || data?.result === undefined) {
      return res.status(502).json({ success: false, error: "TON balance lookup failed" });
    }

    const nano = Number(data.result);
    if (!Number.isFinite(nano) || nano < 0) {
      return res.status(502).json({ success: false, error: "Invalid TON balance response" });
    }

    return res.status(200).json({
      success: true,
      balance: nano / 1e9,
      currency: "TON",
      address
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error?.message || "Unable to load admin TON balance"
    });
  }
}
