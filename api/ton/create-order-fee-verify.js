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
      "https://tonapi.io/v2/accounts/" +
      encodeURIComponent(wallet_address) +
      "/events?limit=100";

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

    const events = Array.isArray(data.events)
      ? data.events
      : [];

    let matchedTransfer = null;

    for (const event of events) {
      if (!event.actions) {
        continue;
      }

      for (const action of event.actions) {
        const jettonTransfer =
          action.JettonTransfer ||
          action.jetton_transfer;

        if (!jettonTransfer) {
          continue;
        }

        const sender =
          jettonTransfer.sender?.address ||
          jettonTransfer.sender;

        const recipient =
          jettonTransfer.recipient?.address ||
          jettonTransfer.recipient;

        const jetton =
          jettonTransfer.jetton?.address ||
          jettonTransfer.jetton;

        const amountRaw = String(
          jettonTransfer.amount || "0"
        );

        const eventHash =
          event.event_id ||
          event.transaction?.hash ||
          "";

        if (
          sender === wallet_address &&
          recipient === platform_wallet &&
          jetton === usdt_master &&
          eventHash === transaction_hash
        ) {
          matchedTransfer = {
            sender,
            recipient,
            jetton,
            amount_raw: amountRaw,
            event_id: eventHash
          };

          break;
        }
      }

      if (matchedTransfer) {
        break;
      }
    }

    if (!matchedTransfer) {
      return res.status(400).json({
        success: false,
        verified: false,
        error: "Matching USDT fee transaction not found"
      });
    }

    const actualAmount =
      Number(matchedTransfer.amount_raw) / 1000000;

    if (actualAmount !== fee) {
      return res.status(400).json({
        success: false,
        verified: false,
        error: "USDT fee amount does not match",
        expected_fee: fee,
        actual_amount: actualAmount
      });
    }

    return res.status(200).json({
      success: true,
      verified: true,
      fee_type: "create_order",
      wallet_address: wallet_address,
      platform_wallet: platform_wallet,
      usdt_master: usdt_master,
      transaction_hash: transaction_hash,
      fee_amount: actualAmount
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}