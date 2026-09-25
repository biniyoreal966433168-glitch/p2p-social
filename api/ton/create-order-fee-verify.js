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

    if (!wallet_address || !transaction_hash || !fee_amount) {
      return res.status(400).json({
        error: "wallet_address, transaction_hash and fee_amount are required"
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

    for (const event of events) {
      const eventHash =
        event.event_id ||
        event.transaction?.hash ||
        event.tx_hash ||
        "";

      if (eventHash !== transaction_hash) {
        continue;
      }

      const actions = Array.isArray(event.actions)
        ? event.actions
        : [];

      for (const action of actions) {
        const transfer =
          action.JettonTransfer ||
          action.jetton_transfer ||
          action.jettonTransfer;

        if (!transfer) {
          continue;
        }

        const sender =
          transfer.sender?.address ||
          transfer.sender ||
          "";

        const recipient =
          transfer.recipient?.address ||
          transfer.recipient ||
          "";

        const jetton =
          transfer.jetton?.address ||
          transfer.jetton ||
          "";

        const rawAmount = String(
          transfer.amount || "0"
        );

        const actualAmount =
          Number(rawAmount) / 1000000;

        if (sender !== wallet_address) {
          return res.status(400).json({
            success: false,
            verified: false,
            error: "Sender does not match connected wallet"
          });
        }

        if (recipient !== platform_wallet) {
          return res.status(400).json({
            success: false,
            verified: false,
            error: "Recipient does not match platform wallet"
          });
        }

        if (jetton !== usdt_master) {
          return res.status(400).json({
            success: false,
            verified: false,
            error: "Jetton is not the configured USDT"
          });
        }

        if (actualAmount !== fee) {
          return res.status(400).json({
            success: false,
            verified: false,
            error: "Fee amount does not match",
            expected_fee: fee,
            actual_amount: actualAmount
          });
        }

        return res.status(200).json({
          success: true,
          verified: true,
          fee_type: "create_order",
          wallet_address,
          platform_wallet,
          usdt_master,
          transaction_hash,
          fee_amount: actualAmount
        });
      }
    }

    return res.status(400).json({
      success: false,
      verified: false,
      error: "Matching transaction or USDT transfer not found"
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}