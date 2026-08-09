import { navigateTo } from "./router.js";
import { loginWithEmail } from "./svc_auth.js";
import { showToast } from "./cmp_toast.js";

export function mountLogin(container) {
  const appEl = document.getElementById("app") || container;
  
  appEl.innerHTML = `
    <div class="login-wrapper">
      <div class="login-card">
        <div class="login-header">
          <div class="login-logo-circle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="login-logo-icon">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
          </div>
          <h1 class="login-title">Welcome Back</h1>
          <p class="login-subtitle">Construction Management System</p>
        </div>
        
        <form id="login-form" class="login-form">
          <div class="form-group">
            <label for="login-email" class="form-label">Email Address</label>
            <input type="email" id="login-email" class="form-input" placeholder="Enter your email" required />
          </div>
          
          <button type="submit" class="btn btn-primary login-submit-btn" id="login-submit-btn">
            Sign In
          </button>
        </form>
        
        <div class="login-demo-roles">
          <p class="login-demo-text">Or sign in as a demo user:</p>
          <div class="login-demo-buttons">
            <button type="button" class="btn btn-secondary btn-sm demo-login-btn" data-email="owner@demo.com">Owner</button>
            <button type="button" class="btn btn-secondary btn-sm demo-login-btn" data-email="pm@demo.com">Manager</button>
            <button type="button" class="btn btn-secondary btn-sm demo-login-btn" data-email="engineer@demo.com">Engineer</button>
            <button type="button" class="btn btn-secondary btn-sm demo-login-btn" data-email="finance@demo.com">Accountant</button>
          </div>
        </div>
      </div>
    </div>
    <style>
      .login-wrapper {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: radial-gradient(circle at top left, var(--bg-surface-elevated), var(--bg-main));
        padding: 1rem;
      }
      .login-card {
        background: var(--bg-surface);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 2.5rem;
        width: 100%;
        max-width: 420px;
        box-shadow: 0 20px 40px -10px rgba(0,0,0,0.1);
        backdrop-filter: blur(10px);
        animation: loginFadeIn 0.5s ease-out;
      }
      @keyframes loginFadeIn {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .login-header {
        text-align: center;
        margin-bottom: 2rem;
      }
      .login-logo-circle {
        width: 64px;
        height: 64px;
        background: var(--accent);
        color: white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 1.5rem;
        box-shadow: 0 8px 16px -4px var(--accent-alpha);
      }
      .login-logo-icon {
        width: 32px;
        height: 32px;
      }
      .login-title {
        margin: 0 0 0.5rem;
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--text-main);
      }
      .login-subtitle {
        margin: 0;
        color: var(--text-muted);
        font-size: 0.95rem;
      }
      .login-form {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
        margin-bottom: 2rem;
      }
      .login-submit-btn {
        margin-top: 0.5rem;
        padding: 0.75rem;
        font-size: 1rem;
        font-weight: 600;
        transition: transform 0.2s, box-shadow 0.2s;
      }
      .login-submit-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px -4px var(--accent-alpha);
      }
      .login-submit-btn:active {
        transform: translateY(0);
      }
      .login-demo-roles {
        border-top: 1px solid var(--border);
        padding-top: 1.5rem;
        text-align: center;
      }
      .login-demo-text {
        color: var(--text-muted);
        font-size: 0.85rem;
        margin-bottom: 1rem;
      }
      .login-demo-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        justify-content: center;
      }
    </style>
  `;

  const form = appEl.querySelector("#login-form");
  const emailInput = appEl.querySelector("#login-email");
  const submitBtn = appEl.querySelector("#login-submit-btn");

  const handleLogin = async (email) => {
    submitBtn.textContent = "Signing in...";
    submitBtn.disabled = true;
    try {
      await loginWithEmail(email);
      showToast("Signed in successfully", "success");
      // The app root mount might need to be re-initialized if they were previously on /login
      // but navigating to /dashboard is handled by router if shell is already mounted.
      // Wait, if app is not mounted, we should trigger a full reload or app boot.
      window.location.href = "/dashboard";
    } catch (e) {
      showToast("Login failed. Please check the email.", "error");
      submitBtn.textContent = "Sign In";
      submitBtn.disabled = false;
    }
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    if (email) {
      handleLogin(email);
    }
  });

  appEl.querySelectorAll(".demo-login-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      emailInput.value = btn.dataset.email;
      handleLogin(btn.dataset.email);
    });
  });
}
