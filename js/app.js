/* =========================================
   P2P SOCIAL
   APP.JS
   Shared application functions
========================================= */


/* =========================================
   APP CONFIG
========================================= */

const P2P_SOCIAL = {
  name: "P2P Social",
  version: "1.0.0"
};


/* =========================================
   DOM READY
========================================= */

document.addEventListener(
  "DOMContentLoaded",
  function () {

    initializeApp();

  }
);


/* =========================================
   INITIALIZE APP
========================================= */

function initializeApp() {

  displayCurrentUser();

  setupNavigation();

  setupSearch();

  setupForms();

  updateActiveNavigation();

}


/* =========================================
   CURRENT USER
========================================= */

function getStoredUser() {

  const savedUser =
    localStorage.getItem("user");

  if (!savedUser) {
    return null;
  }

  try {

    return JSON.parse(savedUser);

  } catch (error) {

    console.error(
      "Invalid user data:",
      error
    );

    return null;

  }

}


/* =========================================
   DISPLAY USER
========================================= */

function displayCurrentUser() {

  const user =
    getStoredUser();

  if (!user) {
    return;
  }


  document
    .querySelectorAll("[data-username]")
    .forEach(element => {

      element.textContent =
        user.username || "User";

    });


  document
    .querySelectorAll("[data-email]")
    .forEach(element => {

      element.textContent =
        user.email || "";

    });


  document
    .querySelectorAll("[data-handle]")
    .forEach(element => {

      element.textContent =
        "@" +
        (user.username || "user");

    });


  document
    .querySelectorAll("[data-avatar]")
    .forEach(element => {

      if (user.avatar) {

        element.src =
          user.avatar;

      }

    });

}


/* =========================================
   NAVIGATION
========================================= */

function setupNavigation() {

  document
    .querySelectorAll("[data-link]")
    .forEach(link => {

      link.addEventListener(
        "click",
        function (event) {

          const page =
            link.dataset.link;

          if (!page) {
            return;
          }

          event.preventDefault();

          navigateTo(page);

        }
      );

    });

}


/* =========================================
   NAVIGATE
========================================= */

function navigateTo(page) {

  const allowedPages = [
    "index.html",
    "login.html",
    "register.html",
    "🟢.html",
    "profile.html",
    "🔴.html",
    "messages.html"
  ];


  if (
    !allowedPages.includes(page)
  ) {

    console.warn(
      "Blocked navigation:",
      page
    );

    return;

  }


  window.location.href =
    page;

}


/* =========================================
   ACTIVE NAVIGATION
========================================= */

function updateActiveNavigation() {

  const currentPage =
    window.location.pathname
      .split("/")
      .pop();


  document
    .querySelectorAll(
      ".bottom-nav a"
    )
    .forEach(link => {

      const href =
        link.getAttribute("href");

      if (!href) {
        return;
      }


      if (
        href === currentPage
      ) {

        link.classList.add(
          "active"
        );

      } else {

        link.classList.remove(
          "active"
        );

      }

    });

}


/* =========================================
   SEARCH
========================================= */

function setupSearch() {

  const searchInput =
    document.getElementById(
      "globalSearch"
    );


  if (!searchInput) {
    return;
  }


  searchInput.addEventListener(
    "input",
    function () {

      performSearch(
        searchInput.value
      );

    }
  );

}


function performSearch(query) {

  const search =
    query
      .trim()
      .toLowerCase();


  const items =
    document.querySelectorAll(
      "[data-search]"
    );


  let visible = 0;


  items.forEach(item => {

    const text =
      (
        item.dataset.search ||
        item.textContent
      ).toLowerCase();


    if (
      !search ||
      text.includes(search)
    ) {

      item.style.display = "";

      visible++;

    } else {

      item.style.display =
        "none";

    }

  });


  const empty =
    document.getElementById(
      "searchEmpty"
    );


  if (empty) {

    empty.style.display =
      visible === 0
        ? "block"
        : "none";

  }

}


/* =========================================
   FORMS
========================================= */

function setupForms() {

  document
    .querySelectorAll(
      "form[data-confirm]"
    )
    .forEach(form => {

      form.addEventListener(
        "submit",
        function (event) {

          const message =
            form.dataset.confirm;

          if (
            message &&
            !confirm(message)
          ) {

            event.preventDefault();

          }

        }
      );

    });

}


/* =========================================
   NOTIFICATION
========================================= */

function showNotification(
  message,
  type = "info"
) {

  let notification =
    document.getElementById(
      "appNotification"
    );


  if (!notification) {

    notification =
      document.createElement(
        "div"
      );

    notification.id =
      "appNotification";


    notification.style.position =
      "fixed";

    notification.style.top =
      "78px";

    notification.style.left =
      "50%";

    notification.style.transform =
      "translateX(-50%)";

    notification.style.zIndex =
      "9999";

    notification.style.padding =
      "12px 18px";

    notification.style.borderRadius =
      "10px";

    notification.style.background =
      "#11141B";

    notification.style.border =
      "1px solid #2A3140";

    notification.style.color =
      "#FFFFFF";

    notification.style.boxShadow =
      "0 10px 30px rgba(0,0,0,.4)";


    document.body.appendChild(
      notification
    );

  }


  notification.textContent =
    message;


  if (type === "success") {

    notification.style.borderColor =
      "#35D07F";

  } else if (type === "error") {

    notification.style.borderColor =
      "#FF3158";

  } else {

    notification.style.borderColor =
      "#2F80FF";

  }


  notification.style.display =
    "block";


  clearTimeout(
    notification._timer
  );


  notification._timer =
    setTimeout(
      function () {

        notification.style.display =
          "none";

      },
      3000
    );

}


/* =========================================
   LIKE POST
========================================= */

function likePost(button) {

  if (!button) {
    return;
  }


  const liked =
    button.dataset.liked === "true";


  if (liked) {

    button.dataset.liked =
      "false";

    button.textContent =
      "♡ Like";

  } else {

    button.dataset.liked =
      "true";

    button.textContent =
      "♥ Liked";

  }

}


/* =========================================
   SHARE
========================================= */

async function shareContent(
  title = "P2P Social",
  text = "Check this out on P2P Social!"
) {

  try {

    if (
      navigator.share
    ) {

      await navigator.share({

        title: title,

        text: text,

        url: window.location.href

      });

      return;

    }


    await navigator.clipboard.writeText(
      window.location.href
    );


    showNotification(
      "Link copied!",
      "success"
    );


  } catch (error) {

    console.error(
      "Share error:",
      error
    );

  }

}


/* =========================================
   COPY TEXT
========================================= */

async function copyText(
  text
) {

  try {

    await navigator.clipboard.writeText(
      text
    );

    showNotification(
      "Copied!",
      "success"
    );

  } catch (error) {

    console.error(
      "Copy error:",
      error
    );

    showNotification(
      "Could not copy.",
      "error"
    );

  }

}


/* =========================================
   LOGOUT
========================================= */

async function logout() {

  const confirmed =
    confirm(
      "Do you want to log out?"
    );


  if (!confirmed) {
    return;
  }


  /*
    Tell the backend to destroy
    the authenticated session.
  */

  try {

    await fetch(
      "/api/logout",
      {
        method: "POST",
        credentials: "include"
      }
    );

  } catch (error) {

    console.error(
      "Logout request failed:",
      error
    );

  }


  localStorage.removeItem(
    "user"
  );


  window.location.href =
    "login.html";

}


/* =========================================
   LOGIN CHECK
========================================= */

function isLoggedIn() {

  return (
    getStoredUser() !== null
  );

}


/* =========================================
   REQUIRE LOGIN
========================================= */

function requireLocalUser() {

  if (!isLoggedIn()) {

    window.location.href =
      "login.html";

    return false;

  }

  return true;

}


/* =========================================
   FORMAT MONEY
========================================= */

function formatMoney(
  amount,
  currency = "ETB"
) {

  const number =
    Number(amount);


  if (
    !Number.isFinite(number)
  ) {

    return `0.00 ${currency}`;

  }


  return (
    number.toLocaleString(
      "en-US",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    ) +
    " " +
    currency
  );

}


/* =========================================
   FORMAT DATE
========================================= */

function formatDate(
  date
) {

  const parsed =
    new Date(date);


  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {

    return "";

  }


  return parsed.toLocaleString(
    "en-US",
    {
      dateStyle: "medium",
      timeStyle: "short"
    }
  );

}


/* =========================================
   ESCAPE HTML
========================================= */

function escapeHTML(
  value
) {

  return String(value)
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );

}


/* =========================================
   P2P PAGE
========================================= */

function openP2P() {

  window.location.href =
    "🔴.html";

}


/* =========================================
   LIVE PAGE
========================================= */

function openLive() {

  window.location.href =
    "🟢.html";

}


/* =========================================
   PROFILE PAGE
========================================= */

function openProfile() {

  window.location.href =
    "profile.html";

}


/* =========================================
   MESSAGES PAGE
========================================= */

function openMessages() {

  window.location.href =
    "messages.html";

}