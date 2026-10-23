/* =========================================
   P2P SOCIAL
   WALLET.JS
========================================= */

const WALLET_API = "/api";

let selectedTradeType = "buy";


/* =========================================
   API HELPER
========================================= */

async function walletRequest(endpoint, options = {}) {

  try {

    const response = await fetch(
      `${WALLET_API}${endpoint}`,
      {
        ...options,

        credentials: "include",

        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {})
        }
      }
    );


    let data = {};

    try {
      data = await response.json();
    } catch {
      data = {};
    }


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Something went wrong."
      );

    }


    return data;

  } catch (error) {

    console.error(
      "Wallet error:",
      error
    );

    throw error;

  }

}


/* =========================================
   LOAD WALLET
========================================= */

async function loadWallet() {

  try {

    const data =
      await walletRequest("/wallet");


    if (data.balance !== undefined) {

      updateBalance(
        data.balance,
        data.currency || "ETB"
      );

    }


    if (data.transactions) {

      displayTransactions(
        data.transactions
      );

    }

  } catch (error) {

    console.error(
      "Unable to load wallet:",
      error
    );

    showWalletMessage(
      error.message
    );

  }

}


/* =========================================
   UPDATE BALANCE
========================================= */

function updateBalance(
  amount,
  currency = "ETB"
) {

  const balanceElement =
    document.getElementById("balance");


  if (!balanceElement) {
    return;
  }


  const number =
    Number(amount);


  if (!Number.isFinite(number)) {

    balanceElement.textContent =
      `0.00 ${currency}`;

    return;

  }


  balanceElement.textContent =
    `${number.toLocaleString(
      "en-US",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    )} ${currency}`;

}


/* =========================================
   BUY / SELL
========================================= */

function selectTrade(type) {

  if (
    type !== "buy" &&
    type !== "sell"
  ) {
    return;
  }


  selectedTradeType = type;


  const buyTab =
    document.getElementById("buyTab");

  const sellTab =
    document.getElementById("sellTab");

  const currency =
    document.getElementById("currency");

  const tradeButton =
    document.getElementById("tradeButton");


  if (
    !buyTab ||
    !sellTab ||
    !currency ||
    !tradeButton
  ) {
    return;
  }


  if (type === "buy") {

    buyTab.classList.add("active");

    sellTab.classList.remove("active");

    currency.textContent =
      "ETB";

    tradeButton.textContent =
      "Find USDT Offers";

  } else {

    sellTab.classList.add("active");

    buyTab.classList.remove("active");

    currency.textContent =
      "USDT";

    tradeButton.textContent =
      "Find Buyers";

  }

}


/* =========================================
   START P2P TRADE
========================================= */

async function startTrade() {

  const amountInput =
    document.getElementById("amount");


  if (!amountInput) {
    return;
  }


  const amount =
    Number(amountInput.value);


  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {

    showWalletMessage(
      "Enter a valid amount."
    );

    return;

  }


  const button =
    document.getElementById(
      "tradeButton"
    );


  try {

    if (button) {

      button.disabled = true;

      button.textContent =
        "Searching...";

    }


    const data =
      await walletRequest(
        "/p2p/offers",
        {
          method: "POST",

          body: JSON.stringify({

            type: selectedTradeType,

            amount: amount,

            currency:
              selectedTradeType === "buy"
                ? "ETB"
                : "USDT"

          })
        }
      );


    if (data.offers) {

      displayOffers(
        data.offers
      );

    }


  } catch (error) {

    showWalletMessage(
      error.message
    );

  } finally {

    if (button) {

      button.disabled = false;

      button.textContent =
        selectedTradeType === "buy"
          ? "Find USDT Offers"
          : "Find Buyers";

    }

  }

}


/* =========================================
   DISPLAY P2P OFFERS
========================================= */

function displayOffers(offers) {

  const container =
    document.getElementById("offers");


  if (!container) {
    return;
  }


  container.innerHTML = "";


  if (
    !Array.isArray(offers) ||
    offers.length === 0
  ) {

    container.innerHTML = `
      <div class="empty">
        No offers available.
      </div>
    `;

    return;

  }


  offers.forEach(offer => {

    const element =
      document.createElement("div");

    element.className =
      "offer";


    const username =
      escapeHTML(
        offer.username || "Trader"
      );


    const price =
      Number(offer.price);


    const safePrice =
      Number.isFinite(price)
        ? price.toLocaleString(
            "en-US",
            {
              minimumFractionDigits: 2
            }
          )
        : "—";


    element.innerHTML = `

      <div class="offer-top">

        <div>

          <div class="seller">
            @${username}
          </div>

          <div class="online">
            ● ${
              offer.online
                ? "Online"
                : "Offline"
            }
          </div>

        </div>

        <div class="price">
          ${safePrice} ETB
        </div>

      </div>


      <div class="offer-info">

        <span>
          Limit:
          ${escapeHTML(
            offer.min || "—"
          )}
          -
          ${escapeHTML(
            offer.max || "—"
          )}
          ETB
        </span>

        <span>
          ${
            escapeHTML(
              offer.completionRate || "—"
            )
          }
        </span>

      </div>


      <button
        class="buy-btn"
        data-offer-id="${escapeHTML(
          offer.id || ""
        )}">
        ${
          selectedTradeType === "buy"
            ? "Buy USDT"
            : "Sell USDT"
        }
      </button>

    `;


    const button =
      element.querySelector(
        ".buy-btn"
      );


    if (button) {

      button.addEventListener(
        "click",
        function () {

          selectOffer(
            offer.id
          );

        }
      );

    }


    container.appendChild(
      element
    );

  });

}


/* =========================================
   SELECT OFFER
========================================= */

async function selectOffer(
  offerId
) {

  if (!offerId) {

    showWalletMessage(
      "Invalid P2P offer."
    );

    return;

  }


  const confirmed =
    confirm(
      "Continue with this P2P offer?"
    );


  if (!confirmed) {
    return;
  }


  try {

    const data =
      await walletRequest(
        `/p2p/orders`,
        {
          method: "POST",

          body: JSON.stringify({

            offerId: offerId,

            type:
              selectedTradeType

          })
        }
      );


    if (data.orderId) {

      alert(
        "P2P order created successfully."
      );

      /*
        Later you can redirect to:

        order.html?id=ORDER_ID
      */

      window.location.href =
        `🔴.html?order=${encodeURIComponent(
          data.orderId
        )}`;

    } else {

      showWalletMessage(
        "Order created."
      );

    }


  } catch (error) {

    showWalletMessage(
      error.message
    );

  }

}


/* =========================================
   DEPOSIT
========================================= */

async function deposit() {

  try {

    const data =
      await walletRequest(
        "/wallet/deposit",
        {
          method: "POST"
        }
      );


    if (data.paymentUrl) {

      window.location.href =
        data.paymentUrl;

      return;

    }


    showWalletMessage(
      "Deposit instructions are ready."
    );


  } catch (error) {

    showWalletMessage(
      error.message
    );

  }

}


/* =========================================
   WITHDRAW
========================================= */

async function withdraw() {

  const amount =
    prompt(
      "Enter withdrawal amount:"
    );


  if (amount === null) {
    return;
  }


  const number =
    Number(amount);


  if (
    !Number.isFinite(number) ||
    number <= 0
  ) {

    showWalletMessage(
      "Enter a valid amount."
    );

    return;

  }


  try {

    await walletRequest(
      "/wallet/withdraw",
      {
        method: "POST",

        body: JSON.stringify({
          amount: number
        })
      }
    );


    showWalletMessage(
      "Withdrawal request submitted."
    );


    await loadWallet();


  } catch (error) {

    showWalletMessage(
      error.message
    );

  }

}


/* =========================================
   TRANSACTION HISTORY
========================================= */

async function history() {

  const transactionBox =
    document.getElementById(
      "transactions"
    );


  if (transactionBox) {

    transactionBox.scrollIntoView({
      behavior: "smooth"
    });

  }


  try {

    const data =
      await walletRequest(
        "/wallet/transactions"
      );


    displayTransactions(
      data.transactions || []
    );


  } catch (error) {

    showWalletMessage(
      error.message
    );

  }

}


/* =========================================
   DISPLAY TRANSACTIONS
========================================= */

function displayTransactions(
  transactions
) {

  const container =
    document.getElementById(
      "transactions"
    );


  if (!container) {
    return;
  }


  container.innerHTML = "";


  if (
    !Array.isArray(transactions) ||
    transactions.length === 0
  ) {

    container.innerHTML = `
      <div class="empty">
        No transactions yet.
      </div>
    `;

    return;

  }


  transactions.forEach(
    transaction => {

      const element =
        document.createElement("div");

      element.className =
        "transaction";


      const amount =
        Number(
          transaction.amount
        );


      const amountText =
        Number.isFinite(amount)
          ? amount.toLocaleString(
              "en-US",
              {
                minimumFractionDigits: 2
              }
            )
          : "—";


      const positive =
        transaction.type === "deposit" ||
        transaction.type === "received";


      element.innerHTML = `

        <div class="transaction-left">

          <div class="transaction-icon">
            ${
              positive
                ? "↓"
                : "↑"
            }
          </div>

          <div>

            <div class="transaction-title">
              ${escapeHTML(
                transaction.type ||
                "Transaction"
              )}
            </div>

            <div class="transaction-date">
              ${escapeHTML(
                transaction.date ||
                ""
              )}
            </div>

          </div>

        </div>


        <div class="${
          positive
            ? "transaction-positive"
            : "transaction-negative"
        }">

          ${
            positive
              ? "+"
              : "-"
          }

          ${amountText}

          ${escapeHTML(
            transaction.currency ||
            "ETB"
          )}

        </div>

      `;


      container.appendChild(
        element
      );

    }
  );

}


/* =========================================
   PAYMENT METHOD
========================================= */

function paymentMethod() {

  const method =
    prompt(
      "Payment method:\n\n" +
      "1. Bank Transfer\n" +
      "2. Mobile Money\n" +
      "3. Other"
    );


  if (!method) {
    return;
  }


  const input =
    document.querySelector(
      '.input-box input[readonly]'
    );


  if (input) {

    input.value =
      method === "1"
        ? "Bank Transfer"
        : method === "2"
        ? "Mobile Money"
        : "Other";

  }

}


/* =========================================
   MESSAGE
========================================= */

function showWalletMessage(
  message
) {

  alert(
    message ||
    "Something went wrong."
  );

}


/* =========================================
   SECURITY
========================================= */

function escapeHTML(value) {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


/* =========================================
   INITIALIZE
========================================= */

document.addEventListener(
  "DOMContentLoaded",
  function () {

    /*
      Only load wallet data when
      wallet.html is open.
    */

    if (
      document.getElementById("balance")
    ) {

      loadWallet();

    }

  }
);