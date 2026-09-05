import { TronWeb } from "tronweb";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    const auth = req.headers.authorization;

    if (!auth?.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "Authentication required"
      });
    }

    const token = auth.replace("Bearer ", "");

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({
        success: false,
        error: "Invalid session"
      });
    }

    // Check existing address
    const { data: existing } = await supabase
      .from("wallet_deposit_addresses")
      .select("id,address,network,token,standard,is_active")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (existing) {
      return res.status(200).json({
        success: true,
        existing: true,
        wallet: existing
      });
    }

    if (!process.env.WALLET_ENCRYPTION_KEY) {
      return res.status(500).json({
        success: false,
        error: "WALLET_ENCRYPTION_KEY is not configured"
      });
    }

    // Generate a NEW TRON wallet
    const account = await TronWeb.createAccount();

    const address = account.address.base58;
    const privateKey = account.privateKey;

    // Encrypt private key before database storage
    const key = crypto
      .createHash("sha256")
      .update(process.env.WALLET_ENCRYPTION_KEY)
      .digest();

    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv(
      "aes-256-gcm",
      key,
      iv
    );

    let encrypted = cipher.update(
      privateKey,
      "utf8",
      "hex"
    );

    encrypted += cipher.final("hex");

    const tag = cipher.getAuthTag();

    const encryptedPrivateKey =
      `${encrypted}:${tag.toString("hex")}`;

    // Save unique address for this user
    const { data, error } = await supabase
      .from("wallet_deposit_addresses")
      .insert({
        user_id: user.id,
        address,
        network: "TRON",
        token: "USDT",
        standard: "TRC-20",
        is_active: true,
        encrypted_private_key: encryptedPrivateKey,
        encryption_iv: iv.toString("hex")
      })
      .select("id,address,network,token,standard,is_active")
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    return res.status(200).json({
      success: true,
      existing: false,
      wallet: data
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}