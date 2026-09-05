/* =========================================================
   P2P SOCIAL — WALLET.JS
   =========================================================
   This file is for wallet.html.

   SECURITY:
   - Never put TronGrid secret/API keys here.
   - Blockchain verification must happen server-side.
   - Frontend only requests Supabase RPC operations.
   ========================================================= */


/* =========================================================
   GLOBAL STATE
   ========================================================= */

let currentUser = null;
let blockchainWallet = null;

let myOrders = [];
let availableOffers = [];
let myTrades = [];
let selectedOffer = null;

let realtimeChannel = null;
let transactionsVisible = false;


/* =========================================================
   SUPABASE
   ========================================================= */

/*
   OPTION A:
   Your wallet.html already creates:

   const supabaseClient = window.supabase.createClient(...)

   If so, this file will use it.

   Do NOT put a service_role key here.
*/

if (typeof window.supabaseClient !== "undefined") {
  var supabaseClient = window.supabaseClient;
}


/* =========================================================
   RPC NAMES
   ========================================================= */

const RPC = window.WALLET_RPC || {

  createOrder: "create_p2p_order",
  cancelOrder: "cancel_p2p_order",

  createTrade: "create_p2p_trade",

  buyerPayment: "buyer_confirm_payment",
  sellerRelease: "seller_release_trade",
  buyerCancel: "buyer_cancel_trade",

  dispute: "create_trade_dispute",

  deposit: "submit_usdt_deposit",

  withdrawal: "request_usdt_withdrawal",

  diamonds: "send_diamonds"

};


/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {

  try {

    await loadCurrentUser();

    if (!currentUser) {
      return;
    }

    await loadAll();

    setupRealtime();

    updateFeeRateText();
    updateCurrency();
    updateFeePreview();

  } catch (error) {

    console.error("Wallet initialization error:", error);

    toast(
      getErrorMessage(error, "Wallet initialization failed."),
      "error"
    );

  }

});


/* =========================================================
   CURRENT USER
   ========================================================= */

async function loadCurrentUser() {

  if (!supabaseClient) {
    console.error("supabaseClient is missing.");
    return null;
  }

  const {
    data,
    error
  } = await supabaseClient.auth.getUser();

  if (error) {
    console.error("Auth error:", error);
    currentUser = null;
    return null;
  }

  currentUser = data?.user || null;

  return currentUser;
}


/* =========================================================
   LOAD ALL WALLET DATA
   ========================================================= */

async function loadAll() {

  if (!currentUser) {
    await loadCurrentUser();
  }

  if (!currentUser) {
    return;
  }

  await Promise.allSettled([

    loadProfile(),

    loadBlockchainWallet(),

    refreshBlockchainBalance(),

    loadMyOrders(),

    loadAvailableOffers(),

    loadTrades(),

    loadTransactions(),

    loadMessages()

  ]);

}


/* =========================================================
   PROFILE
   ========================================================= */

async function loadProfile() {

  if (!currentUser || !supabaseClient) {
    return null;
  }

  const {
    data,
    error
  } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) {

    console.error("Profile loading error:", error);

    return null;
  }

  if (!data) {
    return null;
  }

  const usdtBalance =
    Number(
      data.usdt_balance ??
      data.balance ??
      data.wallet_balance ??
      0
    );

  const diamondBalance =
    Number(
      data.diamond_balance ??
      data.diamonds ??
      0
    );

  setText(
    [
      "walletBalance",
      "usdtBalance",
      "balance"
    ],
    money(usdtBalance) + " USDT"
  );

  setText(
    [
      "diamondBalance",
      "diamondsBalance",
      "diamondBalanceDisplay"
    ],
    moneyNoDecimals(diamondBalance) + " 💎"
  );

  return data;
}


/* =========================================================
   BLOCKCHAIN WALLET
   ========================================================= */

async function loadBlockchainWallet() {

  if (!currentUser || !supabaseClient) {
    return null;
  }

  const {
    data,
    error
  } = await supabaseClient
    .from("wallet_deposit_addresses")
    .select("*")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (error) {

    console.error(
      "Blockchain wallet loading error:",
      error
    );

    blockchainWallet = null;

    showDepositAddress("");

    return null;
  }

  blockchainWallet = data || null;

  const address =
    blockchainWallet?.address ||
    blockchainWallet?.deposit_address ||
    blockchainWallet?.trc20_address ||
    "";

  showDepositAddress(address);

  return blockchainWallet;
}


/* =========================================================
   DEPOSIT ADDRESS DISPLAY
   ========================================================= */

function showDepositAddress(address) {

  const elements = [

    document.getElementById("depositAddressDisplay"),

    document.getElementById("depositAddress"),

    document.getElementById("depositWalletAddress")

  ].filter(Boolean);

  elements.forEach(element => {

    if ("value" in element) {
      element.value = address || "";
    }

    element.textContent = address || "No deposit address assigned";

  });

}


/* =========================================================
   BLOCKCHAIN BALANCE
   ========================================================= */

async function refreshBlockchainBalance() {

  if (!currentUser) {
    return null;
  }

  /*
     IMPORTANT:

     Do NOT call TronGrid with a secret API key from this file.

     The correct architecture is:

     wallet.js
          ↓
     Supabase Edge Function / secure backend
          ↓
     TronGrid
          ↓
     verified balance
  */

  try {

    const address =
      blockchainWallet?.address ||
      blockchainWallet?.deposit_address ||
      blockchainWallet?.trc20_address;

    if (!address) {
      return null;
    }

    /*
       If you already have a secure Edge Function,
       set its name in:

       window.TRON_BALANCE_FUNCTION

       Example:

       window.TRON_BALANCE_FUNCTION =
         "tron-usdt-balance";
    */

    const functionName =
      window.TRON_BALANCE_FUNCTION ||
      null;

    if (!functionName) {

      console.log(
        "No secure TRON balance function configured."
      );

      return null;
    }

    const {
      data,
      error
    } = await supabaseClient.functions.invoke(
      functionName,
      {
        body: {
          address: address,
          network: "TRC20"
        }
      }
    );

    if (error) {
      throw error;
    }

    const balance =
      Number(
        data?.balance ??
        data?.usdt_balance ??
        0
      );

    setText(
      [
        "blockchainBalance",
        "tronBalance",
        "depositBalance"
      ],
      money(balance) + " USDT"
    );

    return balance;

  } catch (error) {

    console.error(
      "Blockchain balance error:",
      error
    );

    return null;
  }
}


/* =========================================================
   DEPOSIT
   ========================================================= */

function openDeposit() {

  openModal("depositModal");

  refreshDepositInformation();

}


async function refreshDepositInformation() {

  if (!currentUser) {

    showLogin();

    return;
  }

  await Promise.allSettled([

    loadBlockchainWallet(),

    refreshBlockchainBalance(),

    loadDepositHistory()

  ]);

}


/* =========================================================
   COPY DEPOSIT ADDRESS
   ========================================================= */

async function copyDepositAddress() {

  const address =
    blockchainWallet?.address ||
    blockchainWallet?.deposit_address ||
    blockchainWallet?.trc20_address ||
    document.getElementById(
      "depositAddressDisplay"
    )?.textContent ||
    "";

  if (!address ||
      address === "No deposit address assigned") {

    toast(
      "No deposit address available.",
      "error"
    );

    return;
  }

  try {

    await navigator.clipboard.writeText(
      address.trim()
    );

    toast(
      "Deposit address copied."
    );

  } catch (error) {

    const textarea =
      document.createElement("textarea");

    textarea.value = address.trim();

    document.body.appendChild(textarea);

    textarea.select();

    document.execCommand("copy");

    textarea.remove();

    toast(
      "Deposit address copied."
    );

  }

}


/* =========================================================
   SUBMIT DEPOSIT
   ========================================================= */

async function submitDeposit() {

  if (!currentUser) {

    showLogin();

    return;
  }

  const amount =
    Number(
      document.getElementById(
        "depositAmount"
      )?.value
    );

  const txHash =
    (
      document.getElementById(
        "depositTxHash"
      )?.value || ""
    ).trim();

  const note =
    (
      document.getElementById(
        "depositNote"
      )?.value || ""
    ).trim();

  const address =
    blockchainWallet?.address ||
    blockchainWallet?.deposit_address ||
    blockchainWallet?.trc20_address ||
    "";

  if (!Number.isFinite(amount) || amount <= 0) {

    toast(
      "Enter a valid deposit amount.",
      "error"
    );

    return;
  }

  if (!address) {

    toast(
      "No deposit address is assigned to your account.",
      "error"
    );

    return;
  }

  if (!txHash) {

    toast(
      "Enter the TRON transaction hash.",
      "error"
    );

    return;
  }

  try {

    setButtonLoading(
      "submitDepositButton",
      true
    );

    const {
      data,
      error
    } = await supabaseClient.rpc(
      RPC.deposit,
      {
        p_amount: amount,
        p_address: address,
        p_network: "TRC20",
        p_note:
          [
            "TX: " + txHash,
            note
          ]
          .filter(Boolean)
          .join(" | ")
      }
    );

    if (error) {
      throw error;
    }

    toast(
      "Deposit submitted for verification."
    );

    clearInputs([
      "depositAmount",
      "depositTxHash",
      "depositNote"
    ]);

    await Promise.allSettled([

      loadProfile(),

      loadTransactions(),

      loadDepositHistory(),

      refreshBlockchainBalance()

    ]);

  } catch (error) {

    console.error(
      "Deposit error:",
      error
    );

    toast(
      getErrorMessage(
        error,
        "Deposit submission failed."
      ),
      "error"
    );

  } finally {

    setButtonLoading(
      "submitDepositButton",
      false
    );

  }

}


/* =========================================================
   DEPOSIT HISTORY
   ========================================================= */

async function loadDepositHistory() {

  if (!currentUser || !supabaseClient) {
    return [];
  }

  const {
    data,
    error
  } = await supabaseClient
    .from("usdt_ledger")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", {
      ascending: false
    })
    .limit(20);

  if (error) {

    console.error(
      "Deposit history error:",
      error
    );

    return [];
  }

  const deposits =
    (data || []).filter(row => {

      const type =
        String(
          row.type ??
          row.transaction_type ??
          row.kind ??
          ""
        ).toLowerCase();

      return (
        type.includes("deposit") ||
        type.includes("credit") ||
        type.includes("receive")
      );

    });

  renderDepositHistory(deposits);

  return deposits;
}


function renderDepositHistory(rows) {

  const container =
    document.getElementById(
      "depositHistory"
    );

  if (!container) {
    return;
  }

  if (!rows.length) {

    container.innerHTML =
      emptyHtml(
        "No deposits yet."
      );

    return;
  }

  container.innerHTML =
    rows.map(row => {

      const amount =
        Number(
          row.amount ??
          row.value ??
          0
        );

      const status =
        normalizeStatus(
          row.status ??
          "pending"
        );

      const tx =
        row.tx_hash ??
        row.transaction_hash ??
        row.reference ??
        row.note ??
        "";

      return `
        <div class="history-item">

          <div>
            <strong>
              +${money(amount)} USDT
            </strong>

            <div>
              ${escapeHtml(status)}
            </div>

            <small>
              ${escapeHtml(
                formatDate(
                  row.created_at
                )
              )}
            </small>
          </div>

          ${
            tx
              ? `
                <small>
                  ${escapeHtml(
                    String(tx)
                  )}
                </small>
              `
              : ""
          }

        </div>
      `;

    }).join("");

}


/* =========================================================
   WITHDRAW
   ========================================================= */

function openWithdraw() {

  openModal("withdrawModal");

}


async function submitWithdraw() {

  if (!currentUser) {

    showLogin();

    return;
  }

  const amount =
    Number(
      document.getElementById(
        "withdrawAmount"
      )?.value
    );

  const address =
    (
      document.getElementById(
        "withdrawAddress"
      )?.value || ""
    ).trim();

  const network =
    (
      document.getElementById(
        "withdrawNetwork"
      )?.value || "TRC20"
    ).trim();

  const note =
    (
      document.getElementById(
        "withdrawNote"
      )?.value || ""
    ).trim();

  if (!Number.isFinite(amount) || amount <= 0) {

    toast(
      "Enter a valid withdrawal amount.",
      "error"
    );

    return;
  }

  if (!address) {

    toast(
      "Enter a withdrawal address.",
      "error"
    );

    return;
  }

  if (network !== "TRC20") {

    toast(
      "Only TRC20 withdrawals are currently supported.",
      "error"
    );

    return;
  }

  try {

    setButtonLoading(
      "submitWithdrawButton",
      true
    );

    const {
      data,
      error
    } = await supabaseClient.rpc(
      RPC.withdrawal,
      {
        p_amount: amount,
        p_address: address,
        p_network: network,
        p_note: note || null
      }
    );

    if (error) {
      throw error;
    }

    toast(
      "USDT withdrawal request submitted."
    );

    closeModal("withdrawModal");

    clearInputs([
      "withdrawAmount",
      "withdrawAddress",
      "withdrawNote"
    ]);

    await loadAll();

  } catch (error) {

    console.error(
      "Withdrawal error:",
      error
    );

    toast(
      getErrorMessage(
        error,
        "Withdrawal failed."
      ),
      "error"
    );

  } finally {

    setButtonLoading(
      "submitWithdrawButton",
      false
    );

  }

}


/* =========================================================
   DIAMOND SEND
   ========================================================= */

function openSend() {

  openModal("sendModal");

}


async function submitSend() {

  if (!currentUser) {

    showLogin();

    return;
  }

  const recipient =
    (
      document.getElementById(
        "sendRecipient"
      )?.value || ""
    ).trim();

  const amount =
    Number(
      document.getElementById(
        "sendDiamondAmount"
      )?.value
    );

  const note =
    (
      document.getElementById(
        "sendDiamondNote"
      )?.value || ""
    ).trim();

  if (!recipient) {

    toast(
      "Enter the recipient.",
      "error"
    );

    return;
  }

  if (
    !Number.isInteger(amount) ||
    amount <= 0
  ) {

    toast(
      "Enter a valid diamond amount.",
      "error"
    );

    return;
  }

  try {

    const {
      data,
      error
    } = await supabaseClient.rpc(
      RPC.diamonds,
      {
        p_recipient: recipient,
        p_amount: amount,
        p_note: note || null
      }
    );

    if (error) {
      throw error;
    }

    toast(
      "💎 Diamonds sent successfully."
    );

    closeModal("sendModal");

    clearInputs([
      "sendRecipient",
      "sendDiamondAmount",
      "sendDiamondNote"
    ]);

    await loadProfile();

  } catch (error) {

    console.error(
      "Diamond send error:",
      error
    );

    toast(
      getErrorMessage(
        error,
        "Diamond transfer failed."
      ),
      "error"
    );

  }

}


/* =========================================================
   PLATFORM FEE
   ========================================================= */

const PLATFORM_FEE_RATE = 0.01;


function calculatePlatformFee(value) {

  const amount =
    Number(value) || 0;

  return amount * PLATFORM_FEE_RATE;

}


function calculateTotalWithFee(value) {

  const amount =
    Number(value) || 0;

  return (
    amount +
    calculatePlatformFee(amount)
  );

}


function updateFeeRateText() {

  const elements = document.querySelectorAll(
    "[data-fee-rate], #feeRate, #platformFeeRate"
  );

  elements.forEach(element => {

    element.textContent = "1%";

  });

}


function updateFeePreview() {

  const amountElement =
    document.getElementById(
      "orderAmount"
    );

  const priceElement =
    document.getElementById(
      "orderPrice"
    );

  if (!amountElement ||
      !priceElement) {

    return;
  }

  const amount =
    Number(amountElement.value) || 0;

  const price =
    Number(priceElement.value) || 0;

  const value =
    calculatePairValue(
      amount,
      price
    );

  const fee =
    calculatePlatformFee(value);

  const total =
    calculateTotalWithFee(value);

  setText(
    [
      "feePreview"
    ],
    money(fee) + " USDT"
  );

  setText(
    [
      "totalPreview"
    ],
    money(total) + " USDT"
  );

}


function calculatePairValue(
  amount,
  price
) {

  return (
    (Number(amount) || 0) *
    (Number(price) || 0)
  );

}


function updateCurrency() {

  setText(
    [
      "currency",
      "tradeCurrency"
    ],
    "USDT"
  );

}


/* =========================================================
   CREATE ORDER
   ========================================================= */

async function createOrder() {

  if (!currentUser) {

    showLogin();

    return;
  }

  const pair =
    document.getElementById(
      "pair"
    )?.value;

  const amount =
    Number(
      document.getElementById(
        "orderAmount"
      )?.value
    );

  const price =
    Number(
      document.getElementById(
        "orderPrice"
      )?.value
    );

  const payment =
    document.getElementById(
      "paymentMethod"
    )?.value;

  const orderTypeElement =
    document.querySelector(
      'input[name="orderType"]:checked'
    );

  const orderType =
    orderTypeElement?.value ||
    document.getElementById(
      "orderType"
    )?.value;

  if (!pair) {

    toast(
      "Select a trading pair.",
      "error"
    );

    return;
  }

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {

    toast(
      "Enter a valid amount.",
      "error"
    );

    return;
  }

  if (
    !Number.isFinite(price) ||
    price <= 0
  ) {

    toast(
      "Enter a valid price.",
      "error"
    );

    return;
  }

  if (!payment) {

    toast(
      "Select a payment method.",
      "error"
    );

    return;
  }

  if (!orderType) {

    toast(
      "Select buy or sell.",
      "error"
    );

    return;
  }

  try {

    const {
      data,
      error
    } = await supabaseClient.rpc(
      RPC.createOrder,
      {
        p_order_type: orderType,
        p_pair: pair,
        p_amount: amount,
        p_price: price,
        p_payment_method: payment
      }
    );

    if (error) {
      throw error;
    }

    toast(
      "Order created successfully."
    );

    await Promise.allSettled([
      loadMyOrders(),
      loadAvailableOffers(),
      loadProfile()
    ]);

  } catch (error) {

    console.error(
      "Create order error:",
      error
    );

    toast(
      getErrorMessage(
        error,
        "Could not create order."
      ),
      "error"
    );

  }

}


/* =========================================================
   MY ORDERS
   ========================================================= */

async function loadMyOrders() {

  if (!currentUser) {
    return [];
  }

  const {
    data,
    error
  } = await supabaseClient
    .from("p2p_orders")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", {
      ascending: false
    });

  if (error) {

    console.error(
      "My orders error:",
      error
    );

    return [];
  }

  myOrders = data || [];

  renderMyOrders();

  return myOrders;
}


function renderMyOrders() {

  const container =
    document.getElementById(
      "myOrders"
    );

  if (!container) {
    return;
  }

  if (!myOrders.length) {

    container.innerHTML =
      emptyHtml(
        "No orders yet."
      );

    return;
  }

  container.innerHTML =
    myOrders.map(order => {

      const status =
        normalizeStatus(
          order.status
        );

      return `
        <div class="order-card">

          <div>
            <strong>
              ${escapeHtml(
                String(
                  order.order_type ||
                  ""
                ).toUpperCase()
              )}
            </strong>

            ${escapeHtml(
              formatPair(
                order.pair
              )
            )}
          </div>

          <div>
            Amount:
            ${money(
              order.amount
            )}
          </div>

          <div>
            Price:
            ${money(
              order.price
            )}
          </div>

          <div>
            Status:
            ${escapeHtml(status)}
          </div>

          ${
            ["active", "open", "pending"]
              .includes(status)
              ? `
                <button
                  type="button"
                  onclick="cancelOrder('${escapeJs(order.id)}')"
                >
                  Cancel
                </button>
              `
              : ""
          }

        </div>
      `;

    }).join("");

}


async function cancelOrder(orderId) {

  if (!currentUser) {
    return;
  }

  if (!orderId) {
    return;
  }

  const confirmed =
    confirm(
      "Cancel this order?"
    );

  if (!confirmed) {
    return;
  }

  try {

    const {
      data,
      error
    } = await supabaseClient.rpc(
      RPC.cancelOrder,
      {
        p_order_id: orderId
      }
    );

    if (error) {
      throw error;
    }

    toast(
      "Order cancelled."
    );

    await Promise.allSettled([
      loadMyOrders(),
      loadAvailableOffers()
    ]);

  } catch (error) {

    console.error(
      "Cancel order error:",
      error
    );

    toast(
      getErrorMessage(
        error,
        "Could not cancel order."
      ),
      "error"
    );

  }

}


/* =========================================================
   AVAILABLE OFFERS
   ========================================================= */

async function loadAvailableOffers() {

  if (!currentUser) {
    return [];
  }

  const {
    data,
    error
  } = await supabaseClient
    .from("p2p_orders")
    .select("*")
    .neq("user_id", currentUser.id)
    .in(
      "status",
      [
        "active",
        "open",
        "pending"
      ]
    )
    .order("created_at", {
      ascending: false
    });

  if (error) {

    console.error(
      "Available offers error:",
      error
    );

    return [];
  }

  availableOffers =
    data || [];

  renderOffers();

  return availableOffers;
}


function renderOffers() {

  const container =
    document.getElementById(
      "availableOffers"
    );

  if (!container) {
    return;
  }

  if (!availableOffers.length) {

    container.innerHTML =
      emptyHtml(
        "No available offers."
      );

    return;
  }

  container.innerHTML =
    availableOffers.map(
      order => {

        return `
          <div class="offer-card">

            <div>
              <strong>
                ${escapeHtml(
                  String(
                    order.order_type ||
                    ""
                  ).toUpperCase()
                )}
              </strong>
            </div>

            <div>
              Pair:
              ${escapeHtml(
                formatPair(
                  order.pair
                )
              )}
            </div>

            <div>
              Price:
              ${money(
                order.price
              )}
            </div>

            <div>
              Amount:
              ${money(
                getOfferAvailableAmount(
                  order
                )
              )}
            </div>

            <div>
              Payment:
              ${escapeHtml(
                order.payment_method ||
                ""
              )}
            </div>

            <button
              type="button"
              onclick="openTrade('${escapeJs(order.id)}')"
            >
              Open Trade
            </button>

          </div>
        `;

      }
    ).join("");

}


function openTradePage(orderId) {

  if (!orderId) {
    return;
  }

  window.location.href =
    "p2p-order.html?order_id=" +
    encodeURIComponent(orderId);

}


/* =========================================================
   OPEN TRADE
   ========================================================= */

function openTrade(orderId) {

  selectedOffer =
    availableOffers.find(
      order =>
        String(order.id) ===
        String(orderId)
    );

  if (!selectedOffer) {

    toast(
      "Offer not found.",
      "error"
    );

    return;
  }

  const available =
    getOfferAvailableAmount(
      selectedOffer
    );

  const minimum =
    getMinimumTradeAmount(
      selectedOffer
    );

  const input =
    document.getElementById(
      "tradeAmount"
    );

  if (input) {

    input.min = minimum;
    input.max = available;

    input.value =
      Math.min(
        available,
        Math.max(
          minimum,
          0
        )
      );

  }

  updateTradeFeePreview();

  setText(
    [
      "tradeOfferPrice"
    ],
    money(
      selectedOffer.price
    )
  );

  openModal("tradeModal");

}


function getOfferAvailableAmount(
  offer
) {

  return Number(
    offer?.remaining_amount ??
    offer?.available_amount ??
    offer?.remaining ??
    offer?.amount ??
    0
  );

}


function getMinimumTradeAmount(
  offer
) {

  return Number(
    offer?.min_trade_amount ??
    offer?.minimum_amount ??
    offer?.min_amount ??
    0.000001
  );

}


function getTradeValue() {

  const amount =
    Number(
      document.getElementById(
        "tradeAmount"
      )?.value
    ) || 0;

  const price =
    Number(
      selectedOffer?.price
    ) || 0;

  return calculatePairValue(
    amount,
    price
  );

}


function getTradeValueCurrency() {

  return "USDT";

}


function updateTradeFeePreview() {

  const value =
    getTradeValue();

  const fee =
    calculatePlatformFee(
      value
    );

  const total =
    calculateTotalWithFee(
      value
    );

  setText(
    [
      "tradeValuePreview"
    ],
    money(value) + " USDT"
  );

  setText(
    [
      "tradeFeePreviewAmount"
    ],
    money(fee) + " USDT"
  );

  setText(
    [
      "tradeTotalPreview"
    ],
    money(total) + " USDT"
  );

}


/* =========================================================
   SUBMIT TRADE
   ========================================================= */

async function submitTrade() {

  if (!currentUser) {

    showLogin();

    return;
  }

  if (!selectedOffer) {

    toast(
      "Select an offer first.",
      "error"
    );

    return;
  }

  try {

    const {
      data: offer,
      error: offerError
    } = await supabaseClient
      .from("p2p_orders")
      .select("*")
      .eq("id", selectedOffer.id)
      .maybeSingle();

    if (offerError) {
      throw offerError;
    }

    if (!offer) {

      toast(
        "Offer no longer exists.",
        "error"
      );

      return;
    }

    const status =
      normalizeStatus(
        offer.status
      );

    if (
      ![
        "active",
        "open",
        "pending"
      ].includes(status)
    ) {

      toast(
        "This offer is no longer active.",
        "error"
      );

      return;
    }

    if (
      String(offer.user_id) ===
      String(currentUser.id)
    ) {

      toast(
        "You cannot trade with your own order.",
        "error"
      );

      return;
    }

    const amount =
      Number(
        document.getElementById(
          "tradeAmount"
        )?.value
      );

    const maximum =
      getOfferAvailableAmount(
        offer
      );

    const minimum =
      getMinimumTradeAmount(
        offer
      );

    if (
      !Number.isFinite(amount) ||
      amount < minimum ||
      amount > maximum
    ) {

      toast(
        `Trade amount must be between ${minimum} and ${maximum}.`,
        "error"
      );

      return;
    }

    const roundedAmount =
      Math.floor(
        amount * 1000000
      ) / 1000000;

    const confirmed =
      confirm(
        `Create trade for ${money(roundedAmount)}?`
      );

    if (!confirmed) {
      return;
    }

    const {
      data,
      error
    } = await supabaseClient.rpc(
      RPC.createTrade,
      {
        p_order_id: offer.id,
        p_amount: roundedAmount
      }
    );

    if (error) {
      throw error;
    }

    toast(
      "Trade created successfully."
    );

    closeModal("tradeModal");

    await Promise.allSettled([
      loadAvailableOffers(),
      loadTrades(),
      loadProfile(),
      loadMessages()
    ]);

  } catch (error) {

    console.error(
      "Submit trade error:",
      error
    );

    toast(
      getErrorMessage(
        error,
        "Could not create trade."
      ),
      "error"
    );

  }

}


/* =========================================================
   TRADES
   ========================================================= */

async function loadTrades() {

  if (!currentUser) {
    return [];
  }

  const {
    data,
    error
  } = await supabaseClient
    .from("p2p_trades")
    .select("*")
    .or(
      "buyer_id.eq." +
      currentUser.id +
      ",seller_id.eq." +
      currentUser.id
    )
    .order("created_at", {
      ascending: false
    });

  if (error) {

    console.error(
      "Trades error:",
      error
    );

    return [];
  }

  myTrades =
    data || [];

  renderTrades();

  return myTrades;
}


function renderTrades() {

  const container =
    document.getElementById(
      "trades"
    ) ||
    document.getElementById(
      "tradeHistory"
    );

  if (!container) {
    return;
  }

  if (!myTrades.length) {

    container.innerHTML =
      emptyHtml(
        "No trades yet."
      );

    return;
  }

  container.innerHTML =
    myTrades.map(
      trade => {

        const status =
          normalizeStatus(
            trade.status
          );

        const amount =
          Number(
            trade.amount ??
            trade.trade_amount ??
            0
          );

        const price =
          Number(
            trade.price ??
            0
          );

        const value =
          Number(
            trade.total_value ??
            trade.trade_value ??
            calculatePairValue(
              amount,
              price
            )
          );

        const fee =
          Number(
            trade.platform_fee ??
            calculatePlatformFee(
              value
            )
          );

        const total =
          Number(
            trade.total_with_fee ??
            calculateTotalWithFee(
              value
            )
          );

        const buyer =
          String(
            trade.buyer_id
          ) ===
          String(
            currentUser.id
          );

        const seller =
          String(
            trade.seller_id
          ) ===
          String(
            currentUser.id
          );

        return `
          <div class="trade-card">

            <div>
              <strong>
                Trade #${escapeHtml(
                  String(
                    trade.id
                  )
                )}
              </strong>
            </div>

            <div>
              Status:
              ${escapeHtml(status)}
            </div>

            <div>
              Amount:
              ${money(amount)}
            </div>

            <div>
              Price:
              ${money(price)}
            </div>

            <div>
              Trade value:
              ${money(value)} USDT
            </div>

            <div>
              Platform fee:
              ${money(fee)} USDT
            </div>

            <div>
              Total:
              ${money(total)} USDT
            </div>

            ${
              buyer
                ? "<div>Role: Buyer</div>"
                : ""
            }

            ${
              seller
                ? "<div>Role: Seller</div>"
                : ""
            }

            <div class="trade-actions">
              ${renderTradeActions(trade)}
            </div>

          </div>
        `;

      }
    ).join("");

}


/* =========================================================
   TRADE ACTIONS
   ========================================================= */

function renderTradeActions(trade) {

  const status =
    normalizeStatus(
      trade.status
    );

  if (
    [
      "expired",
      "completed",
      "cancelled",
      "closed"
    ].includes(status)
  ) {

    return `
      <button
        type="button"
        onclick="openTradeMessage('${escapeJs(trade.id)}')"
      >
        Open Message
      </button>
    `;

  }

  const buyer =
    String(trade.buyer_id) ===
    String(currentUser.id);

  const seller =
    String(trade.seller_id) ===
    String(currentUser.id);

  const paid =
    Boolean(
      trade.buyer_paid ??
      trade.payment_sent ??
      false
    );

  let html = "";

  if (buyer && !paid) {

    html += `
      <button
        type="button"
        onclick="confirmBuyerPayment('${escapeJs(trade.id)}')"
      >
        I Have Paid
      </button>

      <button
        type="button"
        onclick="openDispute('${escapeJs(trade.id)}')"
      >
        Open Dispute
      </button>

      <button
        type="button"
        onclick="cancelTrade('${escapeJs(trade.id)}')"
      >
        Cancel Trade
      </button>
    `;

  }

  if (seller && paid) {

    html += `
      <button
        type="button"
        onclick="releaseTrade('${escapeJs(trade.id)}')"
      >
        Release Trade
      </button>

      <button
        type="button"
        onclick="openDispute('${escapeJs(trade.id)}')"
      >
        Dispute
      </button>
    `;

  }

  if (buyer && paid) {

    html += `
      <button
        type="button"
        onclick="openDispute('${escapeJs(trade.id)}')"
      >
        Dispute
      </button>
    `;

  }

  html += `
    <button
      type="button"
      onclick="openTradeMessage('${escapeJs(trade.id)}')"
    >
      Open Message
    </button>
  `;

  return html;

}


/* =========================================================
   BUYER PAYMENT
   ========================================================= */

async function confirmBuyerPayment(
  tradeId
) {

  if (!tradeId) {
    return;
  }

  const confirmed =
    confirm(
      "Confirm that you have paid?"
    );

  if (!confirmed) {
    return;
  }

  try {

    const {
      data,
      error
    } = await supabaseClient.rpc(
      RPC.buyerPayment,
      {
        p_trade_id: tradeId
      }
    );

    if (error) {
      throw error;
    }

    toast(
      "Payment marked as sent."
    );

    await loadTrades();

  } catch (error) {

    console.error(
      "Buyer payment error:",
      error
    );

    toast(
      getErrorMessage(
        error,
        "Could not confirm payment."
      ),
      "error"
    );

  }

}


/* =========================================================
   SELLER RELEASE
   ========================================================= */

async function releaseTrade(
  tradeId
) {

  if (!tradeId) {
    return;
  }

  const confirmed =
    confirm(
      "Release the USDT to the buyer?"
    );

  if (!confirmed) {
    return;
  }

  try {

    const {
      data,
      error
    } = await supabaseClient.rpc(
      RPC.sellerRelease,
      {
        p_trade_id: tradeId
      }
    );

    if (error) {
      throw error;
    }

    toast(
      "Trade released successfully."
    );

    await Promise.allSettled([
      loadTrades(),
      loadProfile(),
      loadTransactions()
    ]);

  } catch (error) {

    console.error(
      "Release trade error:",
      error
    );

    toast(
      getErrorMessage(
        error,
        "Could not release trade."
      ),
      "error"
    );

  }

}


/* =========================================================
   CANCEL TRADE
   ========================================================= */

async function cancelTrade(
  tradeId
) {

  if (!tradeId) {
    return;
  }

  const confirmed =
    confirm(
      "Cancel this trade?"
    );

  if (!confirmed) {
    return;
  }

  try {

    const {
      data,
      error
    } = await supabaseClient.rpc(
      RPC.buyerCancel,
      {
        p_trade_id: tradeId
      }
    );

    if (error) {
      throw error;
    }

    toast(
      "Trade cancelled."
    );

    await Promise.allSettled([
      loadTrades(),
      loadProfile()
    ]);

  } catch (error) {

    console.error(
      "Cancel trade error:",
      error
    );

    toast(
      getErrorMessage(
        error,
        "Could not cancel trade."
      ),
      "error"
    );

  }

}


/* =========================================================
   DISPUTE
   ========================================================= */

let selectedDisputeTradeId = null;


function openDispute(
  tradeId
) {

  selectedDisputeTradeId =
    tradeId;

  openModal(
    "disputeModal"
  );

}


async function submitDispute() {

  if (!selectedDisputeTradeId) {

    toast(
      "Trade not selected.",
      "error"
    );

    return;
  }

  const reason =
    (
      document.getElementById(
        "disputeReason"
      )?.value || ""
    ).trim();

  if (!reason) {

    toast(
      "Enter a dispute reason.",
      "error"
    );

    return;
  }

  try {

    const {
      data,
      error
    } = await supabaseClient.rpc(
      RPC.dispute,
      {
        p_trade_id:
          selectedDisputeTradeId,

        p_reason:
          reason
      }
    );

    if (error) {
      throw error;
    }

    toast(
      "Dispute submitted."
    );

    closeModal(
      "disputeModal"
    );

    selectedDisputeTradeId =
      null;

    await loadTrades();

  } catch (error) {

    console.error(
      "Dispute error:",
      error
    );

    toast(
      getErrorMessage(
        error,
        "Could not submit dispute."
      ),
      "error"
    );

  }

}


/* =========================================================
   TRANSACTIONS
   ========================================================= */

async function loadTransactions() {

  if (!currentUser) {
    return [];
  }

  const {
    data,
    error
  } = await supabaseClient
    .from("usdt_ledger")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", {
      ascending: false
    })
    .limit(50);

  if (error) {

    console.error(
      "Transactions error:",
      error
    );

    return [];
  }

  renderTransactions(
    data || []
  );

  return data || [];
}


function getTransactionCurrency(
  row
) {

  return (
    row.currency ||
    row.asset ||
    row.token ||
    "USDT"
  );

}


function renderTransactions(
  rows
) {

  const container =
    document.getElementById(
      "transactions"
    );

  if (!container) {
    return;
  }

  if (!rows.length) {

    container.innerHTML =
      emptyHtml(
        "No transactions yet."
      );

    return;
  }

  container.innerHTML =
    rows.map(row => {

      const amount =
        Number(
          row.amount ??
          row.value ??
          0
        );

      const type =
        String(
          row.type ??
          row.transaction_type ??
          "transaction"
        );

      const lowerType =
        type.toLowerCase();

      const positive =
        [
          "deposit",
          "credit",
          "receive",
          "received",
          "released",
          "commission",
          "p2p_receive"
        ].some(
          value =>
            lowerType.includes(
              value
            )
        );

      const sign =
        positive
          ? "+"
          : "-";

      return `
        <div class="transaction-item">

          <div>
            <strong>
              ${sign}${money(
                Math.abs(amount)
              )}
              ${escapeHtml(
                getTransactionCurrency(row)
              )}
            </strong>
          </div>

          <div>
            ${escapeHtml(type)}
          </div>

          <small>
            ${escapeHtml(
              formatDate(
                row.created_at
              )
            )}
          </small>

        </div>
      `;

    }).join("");

}


function toggleTransactions() {

  transactionsVisible =
    !transactionsVisible;

  const container =
    document.getElementById(
      "transactions"
    );

  if (!container) {
    return;
  }

  container.classList.toggle(
    "expanded",
    transactionsVisible
  );

}


/* =========================================================
   MESSAGES
   ========================================================= */

async function loadMessages() {

  if (!currentUser) {
    return [];
  }

  const messages =
    myTrades.filter(
      trade => {

        const status =
          normalizeStatus(
            trade.status
          );

        return [
          "pending",
          "paid",
          "open",
          "payment_sent",
          "disputed",
          "completed",
          "released",
          "cancelled",
          "closed",
          "expired"
        ].includes(status);

      }
    );

  renderMessages(
    messages
  );

  return messages;

}


function renderMessages(
  messages
) {

  const container =
    document.getElementById(
      "messages"
    );

  if (!container) {
    return;
  }

  const visible =
    messages.slice(0, 3);

  if (!visible.length) {

    container.innerHTML =
      emptyHtml(
        "No trade messages."
      );

    return;
  }

  container.innerHTML =
    visible.map(trade => {

      return `
        <div class="message-card">

          <strong>
            Trade #${escapeHtml(
              String(
                trade.id
              )
            )}
          </strong>

          <button
            type="button"
            onclick="openTradeMessage('${escapeJs(trade.id)}')"
          >
            Open Message
          </button>

          <button
            type="button"
            onclick="openDispute('${escapeJs(trade.id)}')"
          >
            Dispute
          </button>

        </div>
      `;

    }).join("");

}


function openMessages() {

  window.location.href =
    "message.html";

}


function openTradeMessage(
  tradeId
) {

  if (!tradeId) {
    return;
  }

  window.location.href =
    "message.html?trade_id=" +
    encodeURIComponent(
      tradeId
    );

}


/* =========================================================
   REALTIME
   ========================================================= */

function setupRealtime() {

  if (!supabaseClient ||
      !currentUser) {

    return;
  }

  if (realtimeChannel) {

    try {
      supabaseClient.removeChannel(
        realtimeChannel
      );
    } catch (error) {
      console.warn(error);
    }

  }

  realtimeChannel =
    supabaseClient
      .channel(
        "wallet-p2p-live-" +
        currentUser.id
      );


  realtimeChannel
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "p2p_orders"
      },
      async () => {

        await Promise.allSettled([
          loadMyOrders(),
          loadAvailableOffers()
        ]);

      }
    )


    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "p2p_trades"
      },
      async () => {

        await Promise.allSettled([
          loadTrades(),
          loadMessages()
        ]);

      }
    )


    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "usdt_ledger"
      },
      async payload => {

        const row =
          payload.new ||
          payload.old;

        if (
          row?.user_id &&
          String(row.user_id) !==
          String(currentUser.id)
        ) {

          return;
        }

        await Promise.allSettled([
          loadProfile(),
          loadTransactions(),
          loadDepositHistory()
        ]);

      }
    )


    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "wallet_deposit_addresses"
      },
      async payload => {

        const row =
          payload.new ||
          payload.old;

        if (
          row?.user_id &&
          String(row.user_id) ===
          String(currentUser.id)
        ) {

          await loadBlockchainWallet();

        }

      }
    )


    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "profiles"
      },
      async payload => {

        const row =
          payload.new ||
          payload.old;

        if (
          row?.id &&
          String(row.id) ===
          String(currentUser.id)
        ) {

          await loadProfile();

        }

      }
    );


  realtimeChannel.subscribe(
    status => {

      console.log(
        "Wallet realtime:",
        status
      );

    }
  );

}


/* =========================================================
   AUTO REFRESH
   ========================================================= */

const WALLET_REFRESH_INTERVAL =
  30000;

const walletRefreshTimer =
  setInterval(
    async () => {

      if (!currentUser) {
        return;
      }

      const visible =
        document.visibilityState ===
        "visible";

      if (!visible) {
        return;
      }

      await Promise.allSettled([

        loadProfile(),

        refreshBlockchainBalance()

      ]);

    },
    WALLET_REFRESH_INTERVAL
  );


/* =========================================================
   NAVIGATION
   ========================================================= */

function scrollToCreateOrder() {

  document
    .getElementById(
      "createOrder"
    )
    ?.scrollIntoView({
      behavior: "smooth"
    });

}


function scrollToOffers() {

  document
    .getElementById(
      "availableOffers"
    )
    ?.scrollIntoView({
      behavior: "smooth"
    });

}


function scrollToHistory() {

  document
    .getElementById(
      "tradeHistory"
    )
    ?.scrollIntoView({
      behavior: "smooth"
    });

}


function showAllOrders() {

  const container =
    document.getElementById(
      "myOrders"
    );

  if (!container) {
    return;
  }

  container.classList.add(
    "show-all"
  );

}


/* =========================================================
   MODALS
   ========================================================= */

function openModal(
  id
) {

  const modal =
    document.getElementById(id);

  if (!modal) {
    return;
  }

  modal.classList.add(
    "active"
  );

  modal.style.display =
    "flex";

}


function closeModal(
  id
) {

  const modal =
    document.getElementById(id);

  if (!modal) {
    return;
  }

  modal.classList.remove(
    "active"
  );

  modal.style.display =
    "none";

}


document.addEventListener(
  "click",
  event => {

    const target =
      event.target;

    if (
      target.classList.contains(
        "modal"
      )
    ) {

      target.classList.remove(
        "active"
      );

      target.style.display =
        "none";

    }

  }
);


document.addEventListener(
  "keydown",
  event => {

    if (
      event.key !==
      "Escape"
    ) {

      return;
    }

    document
      .querySelectorAll(
        ".modal.active"
      )
      .forEach(modal => {

        modal.classList.remove(
          "active"
        );

        modal.style.display =
          "none";

      });

  }
);


/* =========================================================
   HELPERS
   ========================================================= */

function formatPair(
  pair
) {

  return String(
    pair || ""
  ).replace(
    /_/g,
    " / "
  );

}


function formatAmount(
  order
) {

  const amount =
    getOfferAvailableAmount(
      order
    );

  const parts =
    getPairParts(
      order?.pair
    );

  return (
    money(amount) +
    (
      parts.base
        ? " " + parts.base
        : ""
    )
  );

}


function getPairParts(
  pair
) {

  const value =
    String(
      pair || ""
    );

  const parts =
    value
      .split(/[_/:-]/)
      .map(
        item =>
          item.trim()
      )
      .filter(Boolean);

  return {

    base:
      parts[0] || "",

    quote:
      parts[1] || "USDT"

  };

}


function formatTradeAmount(
  trade
) {

  return money(
    Number(
      trade?.amount ??
      trade?.trade_amount ??
      0
    )
  );

}


function money(
  value
) {

  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return "0.00";
  }

  return number.toLocaleString(
    undefined,
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
    }
  );

}


function moneyNoDecimals(
  value
) {

  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return "0";
  }

  return number.toLocaleString(
    undefined,
    {
      maximumFractionDigits: 0
    }
  );

}


function formatDate(
  value
) {

  if (!value) {
    return "";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return String(value);

  }

  return date.toLocaleString();

}


function normalizeStatus(
  status
) {

  return String(
    status || ""
  )
    .toLowerCase()
    .trim()
    .replace(
      /[\s-]+/g,
      "_"
    );

}


function statusClass(
  status
) {

  return (
    "status-" +
    normalizeStatus(status)
  );

}


function detail(
  object,
  ...keys
) {

  if (!object) {
    return "";
  }

  for (
    const key of keys
  ) {

    if (
      object[key] !==
      undefined &&
      object[key] !==
      null
    ) {

      return object[key];

    }

  }

  return "";

}


function emptyHtml(
  text
) {

  return `
    <div class="empty-state">
      ${escapeHtml(text)}
    </div>
  `;

}


function escapeHtml(
  value
) {

  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );

}


function escapeJs(
  value
) {

  return String(
    value ?? ""
  )
    .replace(
      /\\/g,
      "\\\\"
    )
    .replace(
      /'/g,
      "\\'"
    )
    .replace(
      /"/g,
      '\\"'
    )
    .replace(
      /\n/g,
      "\\n"
    )
    .replace(
      /\r/g,
      "\\r"
    );

}


function getErrorMessage(
  error,
  fallback
) {

  if (!error) {
    return fallback;
  }

  return (
    error.message ||
    error.error_description ||
    error.details ||
    error.hint ||
    fallback
  );

}


function toast(
  message,
  type = "success"
) {

  const existing =
    document.getElementById(
      "walletToast"
    );

  if (existing) {
    existing.remove();
  }

  const element =
    document.createElement(
      "div"
    );

  element.id =
    "walletToast";

  element.className =
    "wallet-toast " +
    type;

  element.textContent =
    message;

  document.body.appendChild(
    element
  );

  setTimeout(
    () => {

      element.remove();

    },
    3500
  );

}


function setText(
  ids,
  text
) {

  ids.forEach(id => {

    const element =
      document.getElementById(id);

    if (!element) {
      return;
    }

    element.textContent =
      text;

  });

}


function clearInputs(
  ids
) {

  ids.forEach(id => {

    const element =
      document.getElementById(id);

    if (!element) {
      return;
    }

    element.value = "";

  });

}


function setButtonLoading(
  id,
  loading
) {

  const button =
    document.getElementById(id);

  if (!button) {
    return;
  }

  if (
    loading &&
    !button.dataset.originalText
  ) {

    button.dataset.originalText =
      button.textContent;

  }

  button.disabled =
    loading;

  if (loading) {

    button.textContent =
      "Please wait...";

  } else {

    button.textContent =
      button.dataset.originalText ||
      button.textContent;

  }

}


function showLogin() {

  toast(
    "Please log in first.",
    "error"
  );

}


/* =========================================================
   BALANCE HIDE / SHOW
   ========================================================= */

let balanceHidden = false;


function toggleBalance() {

  balanceHidden =
    !balanceHidden;

  const selectors = [

    "#walletBalance",
    "#usdtBalance",
    "#balance"

  ];

  selectors.forEach(selector => {

    const element =
      document.querySelector(
        selector
      );

    if (!element) {
      return;
    }

    if (
      balanceHidden
    ) {

      element.dataset.realValue =
        element.textContent;

      element.textContent =
        "•••••• USDT";

    } else {

      if (
        element.dataset.realValue
      ) {

        element.textContent =
          element.dataset.realValue;

      }

    }

  });

  const buttons =
    document.querySelectorAll(
      "[data-balance-toggle]"
    );

  buttons.forEach(button => {

    button.textContent =
      balanceHidden
        ? "👁️"
        : "🙈";

  });

}


/* =========================================================
   FEE INPUT LISTENERS
   ========================================================= */

document.addEventListener(
  "input",
  event => {

    const id =
      event.target?.id;

    if (
      id === "orderAmount" ||
      id === "orderPrice"
    ) {

      updateFeePreview();

    }

    if (
      id === "tradeAmount"
    ) {

      updateTradeFeePreview();

    }

  }
);


/* =========================================================
   CLEANUP
   ========================================================= */

window.addEventListener(
  "beforeunload",
  () => {

    if (
      realtimeChannel &&
      supabaseClient
    ) {

      try {

        supabaseClient.removeChannel(
          realtimeChannel
        );

      } catch (error) {

        console.warn(
          "Realtime cleanup error:",
          error
        );

      }

    }

    clearInterval(
      walletRefreshTimer
    );

  }
);


/* =========================================================
   EXPORT FUNCTIONS FOR wallet.html
   ========================================================= */

window.loadAll =
  loadAll;

window.loadProfile =
  loadProfile;

window.loadBlockchainWallet =
  loadBlockchainWallet;

window.refreshBlockchainBalance =
  refreshBlockchainBalance;

window.openDeposit =
  openDeposit;

window.copyDepositAddress =
  copyDepositAddress;

window.submitDeposit =
  submitDeposit;

window.loadDepositHistory =
  loadDepositHistory;

window.openWithdraw =
  openWithdraw;

window.submitWithdraw =
  submitWithdraw;

window.openSend =
  openSend;

window.submitSend =
  submitSend;

window.calculatePlatformFee =
  calculatePlatformFee;

window.calculateTotalWithFee =
  calculateTotalWithFee;

window.createOrder =
  createOrder;

window.loadMyOrders =
  loadMyOrders;

window.cancelOrder =
  cancelOrder;

window.loadAvailableOffers =
  loadAvailableOffers;

window.openTrade =
  openTrade;

window.openTradePage =
  openTradePage;

window.submitTrade =
  submitTrade;

window.loadTrades =
  loadTrades;

window.confirmBuyerPayment =
  confirmBuyerPayment;

window.releaseTrade =
  releaseTrade;

window.cancelTrade =
  cancelTrade;

window.openDispute =
  openDispute;

window.submitDispute =
  submitDispute;

window.loadTransactions =
  loadTransactions;

window.toggleTransactions =
  toggleTransactions;

window.loadMessages =
  loadMessages;

window.openMessages =
  openMessages;

window.openTradeMessage =
  openTradeMessage;

window.openModal =
  openModal;

window.closeModal =
  closeModal;

window.toggleBalance =
  toggleBalance;

window.updateFeePreview =
  updateFeePreview;

window.updateTradeFeePreview =
  updateTradeFeePreview;

console.log(
  "P2P Social wallet.js loaded."
);