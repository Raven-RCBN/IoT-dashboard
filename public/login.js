const loginForm = document.getElementById("loginForm");
const loginUsername = document.getElementById("loginUsername");
const loginPassword = document.getElementById("loginPassword");
const loginMessage = document.getElementById("loginMessage");

function setLoginMessage(message, isError = false) {
  loginMessage.textContent = message;
  loginMessage.classList.toggle("error-text", isError);
}

async function readConfig() {
  const response = await fetch("/api/v1/dashboard/config");
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw new Error("Dashboard login is unavailable.");
  }
  return payload.data;
}

async function initLogin() {
  try {
    const config = await readConfig();
    if (config.authenticated || !config.authRequired) {
      window.location.replace("/display.html");
      return;
    }

    if (!config.loginEnabled) {
      setLoginMessage("Dashboard login is not enabled for this host.", true);
      loginForm.querySelector("button").disabled = true;
    }
  } catch (err) {
    setLoginMessage(err.message || "Dashboard login is unavailable.", true);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setLoginMessage("Signing in...");

  try {
    const response = await fetch("/api/v1/dashboard/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: loginUsername.value,
        password: loginPassword.value,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
      setLoginMessage("Invalid username or password.", true);
      return;
    }

    window.location.replace("/display.html");
  } catch (err) {
    setLoginMessage(err.message || "Login failed.", true);
  }
});

initLogin();
