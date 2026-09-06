/* =====================================================
   P2P SOCIAL — WALLET.JS
   UI + SUPABASE CONNECTION
===================================================== */

/* =====================================================
   SUPABASE
===================================================== */

const SUPABASE_URL =
    "https://mbsvuwrgigqfporxwpfr.supabase.co";

const SUPABASE_ANON_KEY =
    "sb_publishable_iclqtQHDwK5IEve0cNjrgQ_CdUDCuBa";

let supabaseClient = null;
let currentUser = null;


/* =====================================================
   START
===================================================== */

document.addEventListener("DOMContentLoaded", async function () {

    console.log("wallet.js loaded");

    if (typeof supabase === "undefined") {

        console.error(
            "Supabase library is not loaded."
        );

        return;
    }

    supabaseClient =
        supabase.createClient(
            SUPABASE_URL,
            SUPABASE_ANON_KEY
        );

    console.log(
        "Supabase client created"
    );

    setupButtons();

    await loadCurrentUser();

});


/* =====================================================
   BUTTONS
===================================================== */

function setupButtons() {

    const depositBtn =
        document.getElementById("depositBtn");

    const withdrawBtn =
        document.getElementById("withdrawBtn");

    const sendBtn =
        document.getElementById("sendBtn");

    const receiveBtn =
        document.getElementById("receiveBtn");

    const tradeBtn =
        document.getElementById("tradeBtn");


    if (depositBtn) {

        depositBtn.addEventListener(
            "click",
            function () {

                console.log(
                    "Deposit button clicked"
                );

                showSection(
                    "depositSection"
                );

            }
        );

    }


    if (withdrawBtn) {

        withdrawBtn.addEventListener(
            "click",
            function () {

                console.log(
                    "Withdraw button clicked"
                );

                showSection(
                    "withdrawSection"
                );

            }
        );

    }


    if (sendBtn) {

        sendBtn.addEventListener(
            "click",
            function () {

                console.log(
                    "Send button clicked"
                );

                showSection(
                    "sendSection"
                );

            }
        );

    }


    if (receiveBtn) {

        receiveBtn.addEventListener(
            "click",
            function () {

                console.log(
                    "Receive button clicked"
                );

                showSection(
                    "receiveSection"
                );

            }
        );

    }


    if (tradeBtn) {

        tradeBtn.addEventListener(
            "click",
            function () {

                console.log(
                    "P2P Trade button clicked"
                );

                showSection(
                    "tradeSection"
                );

            }
        );

    }


    console.log(
        "Wallet buttons initialized"
    );

}


/* =====================================================
   SHOW SECTION
===================================================== */

function showSection(sectionId) {

    const sections = [

        "depositSection",
        "withdrawSection",
        "sendSection",
        "receiveSection",
        "tradeSection"

    ];


    sections.forEach(
        function (id) {

            const section =
                document.getElementById(id);

            if (section) {

                section.style.display =
                    "none";

            }

        }
    );


    const selected =
        document.getElementById(
            sectionId
        );


    if (selected) {

        selected.style.display =
            "block";

        selected.scrollIntoView({

            behavior: "smooth",
            block: "start"

        });

    }
    else {

        console.warn(
            "Section not found:",
            sectionId
        );

    }

}


/* =====================================================
   CURRENT USER
===================================================== */

async function loadCurrentUser() {

    if (!supabaseClient) {
        return;
    }


    try {

        const {
            data,
            error
        } =
            await supabaseClient
                .auth
                .getUser();


        if (error) {

            console.error(
                "Could not get user:",
                error.message
            );

            return;
        }


        currentUser =
            data.user || null;


        if (currentUser) {

            console.log(
                "Logged in:",
                currentUser.id
            );

            await loadWalletBalance();

        }
        else {

            console.log(
                "No logged-in user"
            );

        }

    }
    catch (error) {

        console.error(
            "User loading error:",
            error
        );

    }

}


/* =====================================================
   WALLET BALANCE
===================================================== */

async function loadWalletBalance() {

    if (!currentUser) {

        console.log(
            "No current user"
        );

        return;
    }


    try {

        const {
            data,
            error
        } =
            await supabaseClient
                .from("wallets")
                .select("*")
                .eq(
                    "user_id",
                    currentUser.id
                )
                .maybeSingle();


        if (error) {

            console.error(
                "Wallet loading error:",
                error.message
            );

            return;
        }


        if (!data) {

            console.log(
                "No wallet record found."
            );

            updateBalance(
                0,
                0
            );

            return;
        }


        const usdt =
            Number(
                data.usdt_balance || 0
            );


        const diamonds =
            Number(
                data.diamond_balance || 0
            );


        updateBalance(
            usdt,
            diamonds
        );

    }
    catch (error) {

        console.error(
            "Balance error:",
            error
        );

    }

}


/* =====================================================
   UPDATE BALANCE
===================================================== */

function updateBalance(
    usdt,
    diamonds
) {

    const usdtElements = [

        document.getElementById(
            "usdtBalance"
        ),

        document.getElementById(
            "balanceUSDT"
        ),

        document.getElementById(
            "walletBalance"
        )

    ];


    usdtElements.forEach(
        function (element) {

            if (element) {

                element.textContent =
                    Number(usdt)
                        .toFixed(2) +
                    " USDT";

            }

        }
    );


    const diamondElements = [

        document.getElementById(
            "diamondBalance"
        ),

        document.getElementById(
            "balanceDiamond"
        ),

        document.getElementById(
            "walletDiamondBalance"
        )

    ];


    diamondElements.forEach(
        function (element) {

            if (element) {

                element.textContent =
                    Number(diamonds)
                        .toFixed(0) +
                    " 💎";

            }

        }
    );

}


/* =====================================================
   HIDE / SHOW BALANCE
===================================================== */

let balanceVisible = true;


function toggleBalance() {

    balanceVisible =
        !balanceVisible;


    const usdtElement =
        document.getElementById(
            "usdtBalance"
        );


    const diamondElement =
        document.getElementById(
            "diamondBalance"
        );


    if (!balanceVisible) {

        if (usdtElement) {

            usdtElement.textContent =
                "•••• USDT";

        }


        if (diamondElement) {

            diamondElement.textContent =
                "•••• 💎";

        }

    }
    else {

        loadWalletBalance();

    }

}


/* =====================================================
   DEPOSIT
===================================================== */

function openDeposit() {

    showSection(
        "depositSection"
    );

}


/* =====================================================
   WITHDRAW
===================================================== */

function openWithdraw() {

    showSection(
        "withdrawSection"
    );

}


/* =====================================================
   SEND
===================================================== */

function openSend() {

    showSection(
        "sendSection"
    );

}


/* =====================================================
   RECEIVE
===================================================== */

function openReceive() {

    showSection(
        "receiveSection"
    );

}


/* =====================================================
   P2P TRADE
===================================================== */

function openTrade() {

    showSection(
        "tradeSection"
    );

}


/* =====================================================
   LOGOUT
===================================================== */

async function logoutWallet() {

    if (!supabaseClient) {
        return;
    }


    try {

        const {
            error
        } =
            await supabaseClient
                .auth
                .signOut();


        if (error) {

            console.error(
                "Logout error:",
                error.message
            );

            return;
        }


        currentUser =
            null;


        window.location.href =
            "index.html";

    }
    catch (error) {

        console.error(
            "Logout failed:",
            error
        );

    }

}


/* =====================================================
   REFRESH BALANCE
===================================================== */

async function refreshWallet() {

    console.log(
        "Refreshing wallet..."
    );

    await loadCurrentUser();

}


/* =====================================================
   GLOBAL FUNCTIONS
===================================================== */

window.openDeposit =
    openDeposit;

window.openWithdraw =
    openWithdraw;

window.openSend =
    openSend;

window.openReceive =
    openReceive;

window.openTrade =
    openTrade;

window.toggleBalance =
    toggleBalance;

window.logoutWallet =
    logoutWallet;

window.refreshWallet =
    refreshWallet;