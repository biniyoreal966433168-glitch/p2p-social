const express = require("express");
const crypto = require("crypto");
const { google } = require("googleapis");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===============================
// TEMPORARY DATA
// ===============================

const users = [];
const sessions = new Map();
const wallets = new Map();
const transactions = new Map();

// ===============================
// HELPERS
// ===============================

function createId() {
  return crypto.randomUUID();
}

function hashPassword(password) {
  return crypto
    .createHash("sha256")
    .update(password)
    .digest("hex");
}

// ===============================
// SESSION
// ===============================

function getSessionToken(req) {
  const auth = req.headers.authorization;

  if (auth && auth.startsWith("Bearer ")) {
    return auth.replace("Bearer ", "");
  }

  const cookieHeader = req.headers.cookie;

  if (cookieHeader) {
    const cookies = {};

    cookieHeader.split(";").forEach(cookie => {
      const [key, ...value] = cookie.trim().split("=");

      cookies[key] = decodeURIComponent(value.join("="));
    });

    if (cookies.p2p_session) {
      return cookies.p2p_session;
    }
  }

  return null;
}

function getSessionUser(req) {
  const token = getSessionToken(req);

  if (!token) return null;

  const userId = sessions.get(token);

  if (!userId) return null;

  return users.find(user => user.id === userId) || null;
}

function requireAuth(req, res, next) {
  const user = getSessionUser(req);

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required."
    });
  }

  req.user = user;
  next();
}

// ===============================
// GOOGLE CLIENT
// ===============================

function getGoogleClient(req) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing."
    );
  }

  const protocol =
    req.headers["x-forwarded-proto"] || "https";

  const host =
    req.headers["x-forwarded-host"] ||
    req.headers.host;

  const redirectUri =
    `${protocol}://${host}/api/auth/google/callback`;

  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
}

// ===============================
// HEALTH
// ===============================

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    service: "P2P Social",
    status: "online"
  });
});

// ===============================
// GOOGLE LOGIN
// ===============================

app.get("/api/auth/google", (req, res) => {
  try {
    const oauth2Client = getGoogleClient(req);

    const authorizationUrl =
      oauth2Client.generateAuthUrl({
        access_type: "online",

        scope: [
          "openid",
          "email",
          "profile"
        ]
      });

    res.redirect(authorizationUrl);

  } catch (error) {
    console.error(error);

    res.status(500).send(
      "Google Login is not configured correctly."
    );
  }
});

// ===============================
// GOOGLE CALLBACK
// ===============================

app.get(
  "/api/auth/google/callback",
  async (req, res) => {

    try {

      if (req.query.error) {
        return res.redirect(
          "/login.html?google=cancelled"
        );
      }

      const code = req.query.code;

      if (!code) {
        return res.status(400).send(
          "Google authorization code missing."
        );
      }

      const oauth2Client =
        getGoogleClient(req);

      const { tokens } =
        await oauth2Client.getToken(code);

      oauth2Client.setCredentials(tokens);

      const oauth2 = google.oauth2({
        auth: oauth2Client,
        version: "v2"
      });

      const { data } =
        await oauth2.userinfo.get();

      if (!data.email) {
        return res.status(400).send(
          "Google email was not provided."
        );
      }

      const email =
        data.email.trim().toLowerCase();

      let user =
        users.find(u => u.email === email);

      if (!user) {

        let baseUsername =
          data.name
            ? data.name
                .toLowerCase()
                .replace(/[^a-z0-9]/g, "")
            : email.split("@")[0];

        if (!baseUsername) {
          baseUsername = "user";
        }

        let username = baseUsername;
        let number = 1;

        while (
          users.some(
            u =>
              u.username.toLowerCase() ===
              username.toLowerCase()
          )
        ) {
          username =
            `${baseUsername}${number}`;
          number++;
        }

        user = {
          id: createId(),
          username,
          email,
          passwordHash: null,
          googleId: data.id || null,
          name: data.name || username,
          picture: data.picture || null,
          provider: "google",
          createdAt: new Date().toISOString()
        };

        users.push(user);

        wallets.set(user.id, {
          balance: 0,
          currency: "ETB"
        });

        transactions.set(user.id, []);

      } else {

        user.googleId =
          data.id || user.googleId;

        user.name =
          data.name || user.name;

        user.picture =
          data.picture || user.picture;
      }

      const token = createId();

      sessions.set(token, user.id);

      res.setHeader(
        "Set-Cookie",
        `p2p_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Secure`
      );

      res.redirect(
        "/profile.html"
      );

    } catch (error) {

      console.error(
        "Google OAuth error:",
        error
      );

      res.status(500).send(
        "Google Login failed. Check Vercel logs and Google redirect URI."
      );
    }
  }
);

// ===============================
// REGISTER
// ===============================

app.post("/api/register", (req, res) => {

  const {
    username,
    email,
    password
  } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({
      success: false,
      message:
        "Username, email and password are required."
    });
  }

  const cleanUsername =
    username.trim();

  const cleanEmail =
    email.trim().toLowerCase();

  if (cleanUsername.length < 3) {
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
        user.email === cleanEmail ||
        user.username.toLowerCase() ===
        cleanUsername.toLowerCase()
    );

  if (existingUser) {
    return res.status(409).json({
      success: false,
      message:
        "Username or email already exists."
    });
  }

  const user = {
    id: createId(),
    username: cleanUsername,
    email: cleanEmail,
    passwordHash: hashPassword(password),
    googleId: null,
    name: cleanUsername,
    picture: null,
    provider: "password",
    createdAt: new Date().toISOString()
  };

  users.push(user);

  wallets.set(user.id, {
    balance: 0,
    currency: "ETB"
  });

  transactions.set(user.id, []);

  res.status(201).json({
    success: true,
    message:
      "Account created successfully.",
    user: {
      id: user.id,
      username: user.username,
      email: user.email
    }
  });
});

// ===============================
// LOGIN
// ===============================

app.post("/api/login", (req, res) => {

  const {
    email,
    password
  } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message:
        "Email and password are required."
    });
  }

  const user =
    users.find(
      u =>
        u.email ===
        email.trim().toLowerCase()
    );

  if (
    !user ||
    !user.passwordHash ||
    user.passwordHash !==
      hashPassword(password)
  ) {
    return res.status(401).json({
      success: false,
      message:
        "Invalid email or password."
    });
  }

  const token = createId();

  sessions.set(
    token,
    user.id
  );

  res.setHeader(
    "Set-Cookie",
    `p2p_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Secure`
  );

  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email
    }
  });
});

// ===============================
// CURRENT USER
// ===============================

app.get(
  "/api/me",
  requireAuth,
  (req, res) => {

    res.json({
      success: true,
      user: {
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
        name: req.user.name,
        picture: req.user.picture
      }
    });
  }
);

// ===============================
// LOGOUT
// ===============================

app.post(
  "/api/logout",
  (req, res) => {

    const token =
      getSessionToken(req);

    if (token) {
      sessions.delete(token);
    }

    res.setHeader(
      "Set-Cookie",
      "p2p_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure"
    );

    res.json({
      success: true,
      message: "Logged out."
    });
  }
);

// ===============================
// WALLET
// ===============================

app.get(
  "/api/wallet",
  requireAuth,
  (req, res) => {

    const wallet =
      wallets.get(req.user.id);

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: "Wallet not found."
      });
    }

    res.json({
      success: true,
      balance: wallet.balance,
      currency: wallet.currency
    });
  }
);

// ===============================
// TRANSACTIONS
// ===============================

app.get(
  "/api/wallet/transactions",
  requireAuth,
  (req, res) => {

    res.json({
      success: true,
      transactions:
        transactions.get(req.user.id) || []
    });
  }
);

// ===============================
// VERCEL EXPORT
// ===============================

module.exports = app;