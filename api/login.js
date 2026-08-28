const SUPABASE_URL =
  "https://mbsvuwrgigqfporxwpfr.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_iclqtQHDwK5IEve0cNjrgQ_CdUDCuBa";


// Check Supabase library
if (!window.supabase) {
  alert("Supabase library failed to load.");
  throw new Error("Supabase library not loaded.");
}


// Create Supabase client
const supabaseClient =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );


// Get HTML elements
const loginForm =
  document.getElementById("loginForm");

const loginButton =
  document.getElementById("loginButton");

const googleButton =
  document.getElementById("googleButton");

const message =
  document.getElementById("message");


// Check required elements
if (!loginForm || !loginButton || !message) {

  console.error(
    "Login HTML elements are missing."
  );

  throw new Error(
    "Check loginForm, loginButton and message IDs."
  );
}


// Show message
function showMessage(text, color) {

  message.textContent = text;
  message.style.color = color;

}


// Hide Google for now
if (googleButton) {

  googleButton.style.display = "none";

}


// LOGIN
loginForm.addEventListener(
  "submit",
  async function(event) {

    event.preventDefault();


    const email =
      document
        .getElementById("email")
        .value
        .trim()
        .toLowerCase();


    const password =
      document
        .getElementById("password")
        .value;


    if (!email || !password) {

      showMessage(
        "Please enter your email and password.",
        "red"
      );

      return;

    }


    loginButton.disabled = true;

    loginButton.textContent =
      "Logging in...";


    showMessage(
      "Checking your account...",
      "#2563eb"
    );


    try {

      const result =
        await supabaseClient.auth
          .signInWithPassword({

            email: email,
            password: password

          });


      const data = result.data;
      const error = result.error;


      if (error) {

        console.error(
          "Supabase error:",
          error
        );

        throw error;

      }


      if (!data || !data.user) {

        throw new Error(
          "User login failed."
        );

      }


      console.log(
        "Logged in user:",
        data.user
      );


      showMessage(
        "Login successful!",
        "green"
      );


      // Go to dashboard
      setTimeout(function() {

        window.location.href =
          "/dashboard.html";

      }, 700);


    } catch (error) {

      console.error(
        "LOGIN ERROR:",
        error
      );


      let errorMessage =
        "Login failed.";


      if (error.message) {

        const msg =
          error.message.toLowerCase();


        if (
          msg.includes(
            "invalid login credentials"
          )
        ) {

          errorMessage =
            "Incorrect email or password.";

        }

        else if (
          msg.includes(
            "email not confirmed"
          )
        ) {

          errorMessage =
            "Please verify your email first.";

        }

        else {

          errorMessage =
            error.message;

        }

      }


      showMessage(
        errorMessage,
        "red"
      );


      loginButton.disabled =
        false;

      loginButton.textContent =
        "Login";

    }

  }
);


// CHECK EXISTING SESSION
async function checkSession() {

  try {

    const {
      data,
      error
    } =
      await supabaseClient.auth
        .getSession();


    if (error) {

      console.error(
        "Session error:",
        error
      );

      return;

    }


    if (data.session) {

      console.log(
        "Existing session found."
      );


      window.location.href =
        "/dashboard.html";

    }

  } catch (error) {

    console.error(
      "Session check failed:",
      error
    );

  }

}


// Run session check
checkSession();