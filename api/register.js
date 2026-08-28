import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {
    const { username, email, password } = req.body || {};

    // Validate fields
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Username, email and password are required."
      });
    }

    if (username.length < 3) {
      return res.status(400).json({
        success: false,
        message: "Username must be at least 3 characters."
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters."
      });
    }

    // Supabase server client
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SECRET_KEY
    );

    // Create user
    const { data, error } =
      await supabase.auth.admin.createUser({
        email: email.toLowerCase().trim(),
        password: password,
        email_confirm: false,
        user_metadata: {
          username: username.trim()
        }
      });

    if (error) {
      console.error("Supabase error:", error);

      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    return res.status(201).json({
      success: true,
      message: "Account created successfully.",
      user: {
        id: data.user.id,
        email: data.user.email,
        username: data.user.user_metadata?.username || username
      }
    });

  } catch (error) {
    console.error("API error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error."
    });
  }
}