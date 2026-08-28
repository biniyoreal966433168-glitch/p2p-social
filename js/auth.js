/* =========================================
   P2P SOCIAL
   AUTHENTICATION
========================================= */

const API_URL = "/api";


/* =========================
   REGISTER
========================= */

async function registerUser(username, email, password) {

  try {

    const response = await fetch(
      `${API_URL}/register`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          username: username,
          email: email,
          password: password
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {

      throw new Error(
        data.message || "Registration failed."
      );

    }

    return {
      success: true,
      data: data
    };

  } catch (error) {

    console.error(
      "Registration error:",
      error
    );

    return {
      success: false,
      message: error.message
    };

  }

}


/* =========================
   LOGIN
========================= */

async function loginUser(email, password) {

  try {

    const response = await fetch(
      `${API_URL}/login`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          email: email,
          password: password
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {

      throw new Error(
        data.message || "Login failed."
      );

    }


    /* Save authentication token */

    if (data.token) {

      localStorage.setItem(
        "token",
        data.token
      );

    }


    /* Save user information */

    if (data.user) {

      localStorage.setItem(
        "user",
        JSON.stringify(data.user)
      );

    }


    return {
      success: true,
      data: data
    };

  } catch (error) {

    console.error(
      "Login error:",
      error
    );

    return {
      success: false,
      message: error.message
    };

  }

}


/* =========================
   AUTH HEADERS
========================= */

function getAuthHeaders() {

  const token =
    localStorage.getItem("token");

  if (!token) {

    return {};

  }

  return {
    "Authorization": `Bearer ${token}`
  };

}


/* =========================
   LOGOUT
========================= */

async function logoutUser() {

  try {

    await fetch(
      `${API_URL}/logout`,
      {
        method: "POST",

        headers: {
          ...getAuthHeaders()
        }
      }
    );

  } catch (error) {

    console.error(
      "Logout request error:",
      error
    );

  }


  localStorage.removeItem("token");
  localStorage.removeItem("user");

  window.location.href =
    "login.html";

}


/* =========================
   GET CURRENT USER
========================= */

async function getCurrentUser() {

  try {

    const response = await fetch(
      `${API_URL}/me`,
      {
        method: "GET",

        headers: {
          ...getAuthHeaders()
        }
      }
    );


    if (!response.ok) {

      return null;

    }


    const data =
      await response.json();


    if (data.user) {

      localStorage.setItem(
        "user",
        JSON.stringify(data.user)
      );

      return data.user;

    }


    return null;

  } catch (error) {

    console.error(
      "Current user error:",
      error
    );

    return null;

  }

}


/* =========================
   CHECK LOGIN
========================= */

async function requireLogin() {

  const user =
    await getCurrentUser();


  if (!user) {

    window.location.href =
      "login.html";

    return null;

  }


  return user;

}


/* =========================
   REDIRECT IF ALREADY LOGIN
========================= */

async function redirectIfLoggedIn() {

  const user =
    await getCurrentUser();


  if (user) {

    window.location.href =
      "index.html";

  }

}


/* =========================
   DISPLAY USERNAME
========================= */

function displayUser(user) {

  if (!user) {
    return;
  }


  const usernameElements =
    document.querySelectorAll(
      "[data-username]"
    );


  usernameElements.forEach(
    element => {

      element.textContent =
        user.username || "User";

    }
  );


  const handleElements =
    document.querySelectorAll(
      "[data-handle]"
    );


  handleElements.forEach(
    element => {

      element.textContent =
        "@" +
        (user.username || "user");

    }
  );


  const emailElements =
    document.querySelectorAll(
      "[data-email]"
    );


  emailElements.forEach(
    element => {

      element.textContent =
        user.email || "";

    }
  );

}


/* =========================
   PROTECTED PAGE
========================= */

document.addEventListener(
  "DOMContentLoaded",
  async function () {

    const page =
      document.body.dataset.page;


    if (page === "protected") {

      const user =
        await requireLogin();


      if (user) {

        displayUser(user);

      }

    }

  }
);