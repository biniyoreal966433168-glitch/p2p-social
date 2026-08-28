// ==========================================
// P2P SOCIAL - DATABASE
// SQLite database
// ==========================================

const path = require("path");
const Database = require("better-sqlite3");


// ==========================================
// DATABASE FILE
// ==========================================

const dbPath = path.join(
  __dirname,
  "p2p-social.db"
);

const db = new Database(dbPath);


// ==========================================
// DATABASE SETTINGS
// ==========================================

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");


// ==========================================
// CREATE TABLES
// ==========================================

db.exec(`

  CREATE TABLE IF NOT EXISTS users (

    id TEXT PRIMARY KEY,

    username TEXT NOT NULL UNIQUE,

    email TEXT NOT NULL UNIQUE,

    password_hash TEXT NOT NULL,

    avatar TEXT,

    bio TEXT DEFAULT '',

    created_at TEXT NOT NULL

  );


  CREATE TABLE IF NOT EXISTS wallets (

    id TEXT PRIMARY KEY,

    user_id TEXT NOT NULL UNIQUE,

    balance REAL NOT NULL DEFAULT 0,

    currency TEXT NOT NULL DEFAULT 'ETB',

    created_at TEXT NOT NULL,

    FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE

  );


  CREATE TABLE IF NOT EXISTS transactions (

    id TEXT PRIMARY KEY,

    user_id TEXT NOT NULL,

    type TEXT NOT NULL,

    amount REAL NOT NULL,

    currency TEXT NOT NULL DEFAULT 'ETB',

    status TEXT NOT NULL DEFAULT 'pending',

    reference TEXT UNIQUE,

    created_at TEXT NOT NULL,

    FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE

  );


  CREATE TABLE IF NOT EXISTS p2p_offers (

    id TEXT PRIMARY KEY,

    user_id TEXT NOT NULL,

    type TEXT NOT NULL,

    asset TEXT NOT NULL DEFAULT 'USDT',

    currency TEXT NOT NULL DEFAULT 'ETB',

    price REAL NOT NULL,

    min_amount REAL NOT NULL,

    max_amount REAL NOT NULL,

    status TEXT NOT NULL DEFAULT 'active',

    created_at TEXT NOT NULL,

    FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE

  );


  CREATE TABLE IF NOT EXISTS p2p_orders (

    id TEXT PRIMARY KEY,

    offer_id TEXT NOT NULL,

    buyer_id TEXT NOT NULL,

    seller_id TEXT NOT NULL,

    amount REAL NOT NULL,

    price REAL NOT NULL,

    total REAL NOT NULL,

    status TEXT NOT NULL DEFAULT 'pending',

    created_at TEXT NOT NULL,

    FOREIGN KEY (offer_id)
      REFERENCES p2p_offers(id),

    FOREIGN KEY (buyer_id)
      REFERENCES users(id),

    FOREIGN KEY (seller_id)
      REFERENCES users(id)

  );


  CREATE TABLE IF NOT EXISTS messages (

    id TEXT PRIMARY KEY,

    sender_id TEXT NOT NULL,

    receiver_id TEXT NOT NULL,

    message TEXT NOT NULL,

    read INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL,

    FOREIGN KEY (sender_id)
      REFERENCES users(id)
      ON DELETE CASCADE,

    FOREIGN KEY (receiver_id)
      REFERENCES users(id)
      ON DELETE CASCADE

  );


  CREATE INDEX IF NOT EXISTS
    idx_transactions_user
    ON transactions(user_id);


  CREATE INDEX IF NOT EXISTS
    idx_messages_receiver
    ON messages(receiver_id);


  CREATE INDEX IF NOT EXISTS
    idx_messages_sender
    ON messages(sender_id);


  CREATE INDEX IF NOT EXISTS
    idx_p2p_offers_status
    ON p2p_offers(status);

`);


// ==========================================
// USER FUNCTIONS
// ==========================================

function createUser({
  id,
  username,
  email,
  passwordHash
}) {

  const now =
    new Date().toISOString();


  const create = db.transaction(() => {

    db.prepare(`
      INSERT INTO users (
        id,
        username,
        email,
        password_hash,
        created_at
      )

      VALUES (
        ?,
        ?,
        ?,
        ?,
        ?
      )
    `).run(
      id,
      username,
      email,
      passwordHash,
      now
    );


    db.prepare(`
      INSERT INTO wallets (
        id,
        user_id,
        balance,
        currency,
        created_at
      )

      VALUES (
        ?,
        ?,
        0,
        'ETB',
        ?
      )
    `).run(
      id,
      id,
      now
    );

  });


  create();

  return getUserById(id);

}


function getUserById(id) {

  return db.prepare(`
    SELECT
      id,
      username,
      email,
      avatar,
      bio,
      created_at
    FROM users
    WHERE id = ?
  `).get(id);

}


function getUserByEmail(email) {

  return db.prepare(`
    SELECT *
    FROM users
    WHERE email = ?
  `).get(email);

}


function usernameExists(username) {

  const row = db.prepare(`
    SELECT id
    FROM users
    WHERE username = ?
  `).get(username);

  return !!row;

}


function emailExists(email) {

  const row = db.prepare(`
    SELECT id
    FROM users
    WHERE email = ?
  `).get(email);

  return !!row;

}


// ==========================================
// WALLET FUNCTIONS
// ==========================================

function getWallet(userId) {

  return db.prepare(`
    SELECT
      id,
      user_id,
      balance,
      currency,
      created_at
    FROM wallets
    WHERE user_id = ?
  `).get(userId);

}


function getTransactions(userId) {

  return db.prepare(`
    SELECT
      id,
      type,
      amount,
      currency,
      status,
      reference,
      created_at
    FROM transactions
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId);

}


// ==========================================
// P2P FUNCTIONS
// ==========================================

function getActiveOffers({
  type,
  amount
}) {

  return db.prepare(`
    SELECT

      p2p_offers.id,

      p2p_offers.type,

      p2p_offers.asset,

      p2p_offers.currency,

      p2p_offers.price,

      p2p_offers.min_amount,

      p2p_offers.max_amount,

      users.username

    FROM p2p_offers

    INNER JOIN users
      ON users.id = p2p_offers.user_id

    WHERE
      p2p_offers.type = ?
      AND p2p_offers.status = 'active'
      AND p2p_offers.min_amount <= ?
      AND p2p_offers.max_amount >= ?

    ORDER BY p2p_offers.price ASC
  `).all(
    type,
    amount,
    amount
  );

}


// ==========================================
// MESSAGES
// ==========================================

function getConversation(
  userId,
  otherUserId
) {

  return db.prepare(`
    SELECT

      messages.id,

      messages.message,

      messages.read,

      messages.created_at,

      sender.username AS sender_username

    FROM messages

    INNER JOIN users AS sender
      ON sender.id = messages.sender_id

    WHERE

      (
        messages.sender_id = ?
        AND
        messages.receiver_id = ?
      )

      OR

      (
        messages.sender_id = ?
        AND
        messages.receiver_id = ?
      )

    ORDER BY messages.created_at ASC
  `).all(
    userId,
    otherUserId,
    otherUserId,
    userId
  );

}


// ==========================================
// SAVE MESSAGE
// ==========================================

function createMessage({
  id,
  senderId,
  receiverId,
  message
}) {

  const now =
    new Date().toISOString();


  db.prepare(`
    INSERT INTO messages (
      id,
      sender_id,
      receiver_id,
      message,
      created_at
    )

    VALUES (
      ?,
      ?,
      ?,
      ?,
      ?
    )
  `).run(
    id,
    senderId,
    receiverId,
    message,
    now
  );


  return db.prepare(`
    SELECT *
    FROM messages
    WHERE id = ?
  `).get(id);

}


// ==========================================
// EXPORT
// ==========================================

module.exports = {

  db,

  createUser,

  getUserById,

  getUserByEmail,

  usernameExists,

  emailExists,

  getWallet,

  getTransactions,

  getActiveOffers,

  getConversation,

  createMessage

};