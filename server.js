// ==========================================
// P2P SOCIAL - SERVER
// Email + Password + Google OAuth
// ==========================================

const express = require("express");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { google } = require("googleapis");

const app = express();

const PORT = process.env.PORT || 3000;

const APP_URL =
  process.env.APP_URL ||
  "https://p2p-social.vercel.app";


// ==========================================
// MIDDLEWARE
// ==========================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(__dirname));


// ==========================================
// TEMPORARY DATA
// ==========================================
// IMPORTANT:
// This is temporary storage.
// It will NOT survive server restarts.
// A real production system needs a database.
// ==========================================

const users = [];
const sessions = new Map();
const wallets = new Map();
const transactions = new Map();


// ==========================================
// HELPERS
// ==========================================

function createId() {
  return crypto.randomUUID();
}


function parseCookies(req) {

  const cookies = {};

  const header =
    req.headers.cookie;

  if (!header) {
    return cookies;
  }

  header
    .split(";")
    .forEach(cookie => {

      const index =
        cookie.indexOf("=");

      if (index === -1) {
        return;
      }

      const key =
        cookie
          .slice(0, index)
          .trim();

      const value =
        cookie
          .slice(index + 1)
          .trim();

      cookies[key] =
        decodeURIComponent(value);

    });

  return cookies;
}


function setSessionCookie(res, token) {

  const secure =
    process.env.NODE_ENV === "production"
      ? "; Secure"
      : "";

  res.setHeader(
    "Set-Cookie",
    `p2p_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax${secure}`
  );
}


function clearSessionCookie(res) {

  res.setHeader(
    "Set-Cookie",
    "p2p_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax"
  );

}


// ==========================================
// SESSION
// ==========================================

function getSessionToken(req) {

  const auth =
    req.headers.authorization;

  if (
    auth &&
    auth.startsWith("Bearer ")
  ) {

    return auth.substring(7);

  }


  const cookies =
    parseCookies(req);

  return cookies.p2p_session || null;
}


function getSessionUser(req) {

  const token =
    getSessionToken(req);

  if (!token) {
    return null;
  }

  const userId =
    sessions.get(token);

  if (!userId) {
    return null;
  }

  return users.find(
    user =>
      user.id === userId
  ) || null;
}


function createSession(res, userId) {

  const token =
    createId();

  sessions.set(
    token,
    userId
  );

  setSessionCookie(
    res,
    token
  );

  return token;
}


function requireAuth(req, res, next) {

  const user =
    getSessionUser(req);

  if (!user) {

    return res.status(401).json({
      success: false,
      message:
        "Authentication required."
    });

  }

  req.user = user;

  next();
}


// ==========================================
// GOOGLE OAUTH
// ==========================================

function getGoogleClient() {

  const clientId =
    process.env.GOOGLE_CLIENT_ID;

  const clientSecret =
    process.env.GOOGLE_CLIENT_SECRET;

  if (
    !clientId ||
    !clientSecret
  ) {

    throw new Error(
      "GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing."
    );

  }

  const redirectUri =
    `${APP_URL}/api/auth/google/callback`;

  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

}


// ==========================================
// GOOGLE LOGIN START
// ==========================================

app.get(
  "/api/auth/google",
  (req, res) => {

    try {

      const oauth2Client =
        getGoogleClient();


      const state =
        crypto
          .randomBytes(32)
          .toString("hex");


      // Save OAuth state in an HTTP-only cookie
      const secure =
        process.env.NODE_ENV === "production"
          ? "; Secure"
          : "";

      res.setHeader(
        "Set-Cookie",
        `google_oauth_state=${state}; HttpOnly; Path=/; SameSite=Lax; Max-Age=600${secure}`
      );


      const authorizationUrl =
        oauth2Client.generateAuthUrl({

          access_type:
            "online",

          scope: [
            "openid",
            "email",
            "profile"
          ],

          state

        });


      res.redirect(
        authorizationUrl
      );


    } catch (error) {

      console.error(
        "Google OAuth start error:",
        error
      );

      res.status(500).send(
        "Google Login is not configured correctly."
      );

    }

  }
);


// ==========================================
// GOOGLE CALLBACK
// ==========================================

app.get(
  "/api/auth/google/callback",
  async (req, res) => {

    try {

      if (req.query.error) {

        return res.redirect(
          "/login.html?google=cancelled"
        );

      }


      const code =
        req.query.code;

      const returnedState =
        req.query.state;


      if (!code) {

        return res.status(400).send(
          "Google authorization code missing."
        );

      }


      const cookies =
        parseCookies(req);

      const savedState =
        cookies.google_oauth_state;


      if (
        !savedState ||
        !returnedState ||
        savedState !== returnedState
      ) {

        return res.status(400).send(
          "Invalid Google OAuth state."
        );

      }


      const oauth2Client =
        getGoogleClient();


      const { tokens } =
        await oauth2Client.getToken(
          code
        );


      oauth2Client.setCredentials(
        tokens
      );


      const oauth2 =
        google.oauth2({
          auth: oauth2Client,
          version: "v2"
        });


      const { data } =
        await oauth2.userinfo.get();


      if (!data.email) {

        return res.status(400).send(
          "Google account email was not provided."
        );

      }


      const email =
        data.email
          .trim()
          .toLowerCase();


      let user =
        users.find(
          u =>
            u.email === email
        );


      // ======================================
      // CREATE NEW GOOGLE USER
      // ======================================

      if (!user) {

        let baseUsername =
          data.name
            ? data.name
                .toLowerCase()
                .replace(/[^a-z0-9]/g, "")
            : email
                .split("@")[0]
                .replace(/[^a-z0-9]/g, "");


        if (!baseUsername) {
          baseUsername = "user";
        }


        let username =
          baseUsername;

        let number = 1;


        while (
          users.some(
            u =>
              u.username
                .toLowerCase() ===
              username.toLowerCase()
          )
        ) {

          username =
            `${baseUsername}${number}`;

          number++;

        }


        user = {

          id:
            createId(),

          username,

          email,

          passwordHash:
            null,

          googleId:
            data.id || null,

          name:
            data.name || username,

          picture:
            data.picture || null,

          provider:
            "google",

          createdAt:
            new Date().toISOString()

        };


        users.push(user);


        wallets.set(
          user.id,
          {
            balance: 0,
            currency: "ETB"
          }
        );


        transactions.set(
          user.id,
          []
        );


      } else {

        // Existing user

        user.googleId =
          data.id ||
          user.googleId;

        user.name =
          data.name ||
          user.name;

        user.picture =
          data.picture ||
          user.picture;

      }


      // ======================================
      // CREATE LOGIN SESSION
      // ======================================

      const token =
        createSession(
          res,
          user.id
        );


      // Remove OAuth state cookie
      const secure =
        process.env.NODE_ENV === "production"
          ? "; Secure"
          : "";

      res.setHeader(
        "Set-Cookie",
        [
          `google_oauth_state=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
          `p2p_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax${secure}`
        ]
      );


      res.redirect(
        "/login.html?google=success"
      );


    } catch (error) {

      console.error(
        "Google OAuth callback error:",
        error
      );

      res.status(500).send(
        "Google Login failed. Check Vercel logs and Google OAuth settings."
      );

    }

  }
);


// ==========================================
// HEALTH CHECK
// ==========================================

app.get(
  "/api/health",
  (req, res) => {

    res.json({

      success: true,

      service:
        "P2P Social",

      status:
        "online"

    });

  }
);


// ==========================================
// REGISTER
// ==========================================

app.post(
  "/api/register",
  async (req, res) => {

    try {

      const {
        username,
        email,
        password
      } = req.body;


      if (
        !username ||
        !email ||
        !password
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Username, email and password are required."
        });

      }


      const normalizedUsername =
        username.trim();

      const normalizedEmail =
        email
          .trim()
          .toLowerCase();


      if (
        normalizedUsername.length < 3
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Username must contain at least 3 characters."
        });

      }


      if (password.length < 8) {

        return res.status(400).json({
          success: false,
          message:
            "Password must contain at least 8 characters."
        });

      }


      const existingUser =
        users.find(
          user =>
            user.email ===
              normalizedEmail ||
            user.username.toLowerCase() ===
              normalizedUsername.toLowerCase()
        );


      if (existingUser) {

        return res.status(409).json({
          success: false,
          message:
            "Username or email already exists."
        });

      }


      const passwordHash =
        await bcrypt.hash(
          password,
          12
        );


      const user = {

        id:
          createId(),

        username:
          normalizedUsername,

        email:
          normalizedEmail,

        passwordHash,

        googleId:
          null,

        name:
          normalizedUsername,

        picture:
          null,

        provider:
          "password",

        createdAt:
          new Date().toISOString()

      };


      users.push(user);


      wallets.set(
        user.id,
        {
          balance: 0,
          currency: "ETB"
        }
      );


      transactions.set(
        user.id,
        []
      );


      // Automatically log the new user in
      const token =
        createSession(
          res,
          user.id
        );


      res.status(201).json({

        success: true,

        message:
          "Account created successfully.",

        token,

        user: {

          id:
            user.id,

          username:
            user.username,

          email:
            user.email

        }

      });


    } catch (error) {

      console.error(
        "Register error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Registration failed."
      });

    }

  }
);


// ==========================================
// EMAIL LOGIN
// ==========================================

app.post(
  "/api/login",
  async (req, res) => {

    try {

      const {
        email,
        password
      } = req.body;


      if (
        !email ||
        !password
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Email and password are required."
        });

      }


      const normalizedEmail =
        email
          .trim()
          .toLowerCase();


      const user =
        users.find(
          u =>
            u.email ===
            normalizedEmail
        );


      if (
        !user ||
        !user.passwordHash
      ) {

        return res.status(401).json({
          success: false,
          message:
            "Invalid email or password."
        });

      }


      const valid =
        await bcrypt.compare(
          password,
          user.passwordHash
        );


      if (!valid) {

        return res.status(401).json({
          success: false,
          message:
            "Invalid email or password."
        });

      }


      const token =
        createSession(
          res,
          user.id
        );


      res.json({

        success: true,

        token,

        user: {

          id:
            user.id,

          username:
            user.username,

          email:
            user.email

        }

      });


    } catch (error) {

      console.error(
        "Login error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Login failed."
      });

    }

  }
);


// ==========================================
// CURRENT USER
// ==========================================

app.get(
  "/api/me",
  requireAuth,
  (req, res) => {

    res.json({

      success: true,

      user: {

        id:
          req.user.id,

        username:
          req.user.username,

        email:
          req.user.email,

        name:
          req.user.name,

        picture:
          req.user.picture

      }

    });

  }
);


// ==========================================
// LOGOUT
// ==========================================

app.post(
  "/api/logout",
  (req, res) => {

    const token =
      getSessionToken(req);


    if (token) {

      sessions.delete(
        token
      );

    }


    clearSessionCookie(
      res
    );


    res.json({

      success: true,

      message:
        "Logged out."

    });

  }
);


// ==========================================
// WALLET
// ==========================================

app.get(
  "/api/wallet",
  requireAuth,
  (req, res) => {

    const wallet =
      wallets.get(
        req.user.id
      );


    if (!wallet) {

      return res.status(404).json({
        success: false,
        message:
          "Wallet not found."
      });

    }


    res.json({

      success: true,

      balance:
        wallet.balance,

      currency:
        wallet.currency

    });

  }
);


// ==========================================
// TRANSACTIONS
// ==========================================

app.get(
  "/api/wallet/transactions",
  requireAuth,
  (req, res) => {

    const userTransactions =
      transactions.get(
        req.user.id
      ) || [];


    res.json({

      success: true,

      transactions:
        userTransactions

    });

  }
);


// ==========================================
// DEPOSIT
// ==========================================

app.post(
  "/api/wallet/deposit",
  requireAuth,
  (req, res) => {

    res.status(501).json({

      success: false,

      message:
        "Deposit system is not configured yet."

    });

  }
);


// ==========================================
// WITHDRAW
// ==========================================

app.post(
  "/api/wallet/withdraw",
  requireAuth,
  (req, res) => {

    res.status(501).json({

      success: false,

      message:
        "Withdrawal system is not configured yet."

    });

  }
);


// ==========================================
// P2P OFFERS
// ==========================================

app.post(
  "/api/p2p/offers",
  requireAuth,
  (req, res) => {

    const {
      type,
      amount
    } = req.body;


    if (
      type !== "buy" &&
      type !== "sell"
    ) {

      return res.status(400).json({
        success: false,
        message:
          "Invalid P2P trade type."
      });

    }


    const tradeAmount =
      Number(amount);


    if (
      !Number.isFinite(tradeAmount) ||
      tradeAmount <= 0
    ) {

      return res.status(400).json({
        success: false,
        message:
          "Invalid trade amount."
      });

    }


    res.json({

      success: true,

      offers: []

    });

  }
);


// ==========================================
// CREATE P2P ORDER
// ==========================================

app.post(
  "/api/p2p/orders",
  requireAuth,
  (req, res) => {

    const {
      offerId,
      type
    } = req.body;


    if (!offerId) {

      return res.status(400).json({
        success: false,
        message:
          "Offer ID is required."
      });

    }


    if (
      type !== "buy" &&
      type !== "sell"
    ) {

      return res.status(400).json({
        success: false,
        message:
          "Invalid trade type."
      });

    }


    return res.status(501).json({

      success: false,

      message:
        "P2P trading is not configured yet."

    });

  }
);


// ==========================================
// FRONTEND FALLBACK
// Express 5 syntax
// ==========================================

app.get(
  "/{*splat}",
  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        "index.html"
      )
    );

  }
);


// ==========================================
// START SERVER
// ==========================================

if (
  require.main === module
) {

  app.listen(
    PORT,
    () => {

      console.log(
        `P2P Social running on port ${PORT}`
      );

    }
  );

}


module.exports = app;