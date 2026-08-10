import { loginWithEmail } from "./svc_auth.js";
import { showToast } from "./cmp_toast.js";

export function mountLogin(container) {
  const appEl = document.getElementById("app") || container;
  
  // Wipe out the existing DOM so no dashboard shells remain
  appEl.innerHTML = `
    <div class="login-wrapper premium-login">
      <div class="login-animated-bg"></div>
      
      <div class="login-card premium-glass">
        <div class="login-header">
          <div class="login-logo-circle glow">
            <svg width="48" height="48" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" class="login-logo-icon">
              <path d="M28 16A12 12 0 1 1 4 16A12 12 0 0 1 28 16Z" stroke="#ffffff" stroke-width="2" stroke-dasharray="60 15" stroke-linecap="round" />
              <path d="M12 24V10h4v14" fill="#ffffff" />
              <path d="M16 24v-8h4v8" fill="#f97316" />
              <path d="M12 8L16 4l8 4v2" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M6 20l6-6 4 4 10-10" stroke="#f97316" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M21 8h5v5" fill="#f97316" />
            </svg>
          </div>
          <h1 class="login-title gradient-text">Construction ERP</h1>
          <p class="login-subtitle">Secure Access Portal</p>
        </div>
        
        <form id="login-form" class="login-form">
          <div class="form-group premium-input-group">
            <label for="login-email" class="form-label">Email Address</label>
            <div class="input-with-icon">
              <span class="input-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
              </span>
              <input type="email" id="login-email" class="form-input premium-input" placeholder="Enter your email" required />
            </div>
          </div>
          
          <button type="submit" class="btn btn-primary login-submit-btn premium-btn glow" id="login-submit-btn">
            Sign In Securely
          </button>
        </form>
        
        <div class="login-demo-roles">
          <div class="demo-roles-divider">
            <span>Or quick login as</span>
          </div>
          <div class="login-demo-grid">
            <button type="button" class="demo-role-card" data-email="owner@demo.com">
              <div class="demo-icon owner-icon">👑</div>
              <div class="demo-details">
                <span class="demo-role-name">Owner / Admin</span>
                <span class="demo-role-email">owner@demo.com</span>
              </div>
            </button>
            <button type="button" class="demo-role-card" data-email="pm@demo.com">
              <div class="demo-icon pm-icon">📋</div>
              <div class="demo-details">
                <span class="demo-role-name">Project Manager</span>
                <span class="demo-role-email">pm@demo.com</span>
              </div>
            </button>
            <button type="button" class="demo-role-card" data-email="engineer@demo.com">
              <div class="demo-icon eng-icon">📐</div>
              <div class="demo-details">
                <span class="demo-role-name">Site Engineer</span>
                <span class="demo-role-email">engineer@demo.com</span>
              </div>
            </button>
            <button type="button" class="demo-role-card" data-email="supervisor@demo.com">
              <div class="demo-icon sup-icon">👷‍♂️</div>
              <div class="demo-details">
                <span class="demo-role-name">Site Supervisor</span>
                <span class="demo-role-email">supervisor@demo.com</span>
              </div>
            </button>
            <button type="button" class="demo-role-card" data-email="finance@demo.com">
              <div class="demo-icon fin-icon">💰</div>
              <div class="demo-details">
                <span class="demo-role-name">Accountant</span>
                <span class="demo-role-email">finance@demo.com</span>
              </div>
            </button>
            <button type="button" class="demo-role-card" data-email="procurement@demo.com">
              <div class="demo-icon proc-icon">📦</div>
              <div class="demo-details">
                <span class="demo-role-name">Procurement</span>
                <span class="demo-role-email">procurement@demo.com</span>
              </div>
            </button>
            <button type="button" class="demo-role-card" data-email="rahim@demo.com">
              <div class="demo-icon cli-icon">🏢</div>
              <div class="demo-details">
                <span class="demo-role-name">Client Portal</span>
                <span class="demo-role-email">rahim@demo.com</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
    <style>
      .premium-login {
        min-height: 100vh;
        width: 100vw;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #0d0403;
        position: relative;
        overflow: hidden;
        padding: 2rem;
        font-family: 'Inter', system-ui, sans-serif;
        box-sizing: border-box;
      }
      .login-animated-bg {
        position: absolute;
        top: -50%;
        left: -50%;
        width: 200%;
        height: 200%;
        background: radial-gradient(circle at 50% 50%, rgba(177, 58, 46, 0.15), transparent 50%),
                    radial-gradient(circle at 80% 20%, rgba(143, 44, 34, 0.12), transparent 50%);
        animation: rotateBg 30s linear infinite;
        z-index: 0;
      }
      @keyframes rotateBg {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      .premium-glass {
        position: relative;
        z-index: 1;
        background: rgba(28, 12, 11, 0.85);
        border: 1px solid rgba(177, 58, 46, 0.25);
        border-radius: 24px;
        padding: 3rem;
        width: 100%;
        max-width: 500px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(177, 58, 46, 0.1) inset;
        animation: scaleIn 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        box-sizing: border-box;
      }
      @keyframes scaleIn {
        0% { opacity: 0; transform: scale(0.95) translateY(20px); }
        100% { opacity: 1; transform: scale(1) translateY(0); }
      }
      .login-header {
        text-align: center;
        margin-bottom: 2.5rem;
      }
      .login-logo-circle {
        width: 80px;
        height: 80px;
        background: linear-gradient(135deg, #B13A2E, #8F2C22);
        color: white;
        border-radius: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 1.5rem;
        transform: rotate(-5deg);
        transition: transform 0.3s ease;
      }
      .login-logo-circle:hover {
        transform: rotate(0deg) scale(1.05);
      }
      .login-logo-circle.glow {
        box-shadow: 0 0 30px rgba(177, 58, 46, 0.4);
      }
      .login-logo-icon {
        width: 48px;
        height: 48px;
      }
      .gradient-text {
        background: linear-gradient(135deg, #ffffff, #f1f5f9);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin: 0 0 0.5rem;
        font-size: 1.85rem;
        font-weight: 800;
        letter-spacing: -0.025em;
      }
      .login-subtitle {
        color: #94a3b8;
        font-size: 1rem;
        margin: 0;
      }
      .premium-input-group .form-label {
        color: #cbd5e1;
        font-weight: 500;
        margin-bottom: 0.5rem;
        display: block;
      }
      .input-with-icon {
        position: relative;
      }
      .input-icon {
        position: absolute;
        left: 1rem;
        top: 50%;
        transform: translateY(-50%);
        color: #64748b;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
      }
      .premium-input {
        width: 100%;
        background: rgba(13, 4, 3, 0.6);
        border: 1px solid rgba(177, 58, 46, 0.2);
        color: white;
        padding: 0.875rem 1rem 0.875rem 3rem;
        border-radius: 12px;
        font-size: 1rem;
        transition: all 0.2s;
        box-sizing: border-box;
      }
      .premium-input:focus {
        outline: none;
        border-color: #B13A2E;
        box-shadow: 0 0 0 3px rgba(177, 58, 46, 0.25);
        background: rgba(13, 4, 3, 0.9);
      }
      .premium-btn {
        width: 100%;
        padding: 1rem;
        border-radius: 12px;
        background: linear-gradient(135deg, #B13A2E, #8F2C22);
        color: white;
        font-weight: 600;
        font-size: 1rem;
        border: none;
        cursor: pointer;
        margin-top: 1.5rem;
        transition: all 0.3s ease;
      }
      .premium-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 20px rgba(177, 58, 46, 0.45);
      }
      .premium-btn:active {
        transform: translateY(0);
      }
      
      .demo-roles-divider {
        position: relative;
        text-align: center;
        margin: 2.5rem 0 1.5rem;
      }
      .demo-roles-divider::before {
        content: "";
        position: absolute;
        top: 50%;
        left: 0;
        right: 0;
        height: 1px;
        background: rgba(177, 58, 46, 0.15);
      }
      .demo-roles-divider span {
        position: relative;
        background: #1c0c0b;
        padding: 0 1rem;
        color: #94a3b8;
        font-size: 0.875rem;
        font-weight: 500;
      }
      
      .login-demo-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 0.75rem;
      }
      
      .demo-role-card {
        background: rgba(13, 4, 3, 0.5);
        border: 1px solid rgba(177, 58, 46, 0.1);
        border-radius: 12px;
        padding: 0.75rem;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        cursor: pointer;
        transition: all 0.2s ease;
        text-align: left;
        color: white;
      }
      .demo-role-card:hover {
        background: rgba(177, 58, 46, 0.1);
        border-color: rgba(177, 58, 46, 0.3);
        transform: translateY(-2px);
      }
      .demo-icon {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.25rem;
        background: rgba(177, 58, 46, 0.15);
      }
      .owner-icon { background: rgba(177, 58, 46, 0.2); }
      .pm-icon { background: rgba(177, 58, 46, 0.2); }
      .eng-icon { background: rgba(177, 58, 46, 0.2); }
      .sup-icon { background: rgba(177, 58, 46, 0.2); }
      .fin-icon { background: rgba(177, 58, 46, 0.2); }
      .proc-icon { background: rgba(177, 58, 46, 0.2); }
      .cli-icon { background: rgba(177, 58, 46, 0.2); }
      
      .demo-details {
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .demo-role-name {
        font-weight: 600;
        font-size: 0.9rem;
        color: #e2e8f0;
      }
      .demo-role-email {
        font-size: 0.75rem;
        color: #94a3b8;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      
      /* Make it single column on small screens */
      @media (max-width: 480px) {
        .login-demo-grid {
          grid-template-columns: 1fr;
        }
        .premium-glass {
          padding: 2rem 1.5rem;
        }
      }
    </style>
  `;

  const form = appEl.querySelector("#login-form");
  const emailInput = appEl.querySelector("#login-email");
  const submitBtn = appEl.querySelector("#login-submit-btn");

  const handleLogin = async (email) => {
    submitBtn.innerHTML = `<span class="global-loader-spinner" style="width:20px;height:20px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:8px"></span> Authenticating...`;
    submitBtn.disabled = true;
    try {
      await loginWithEmail(email);
      showToast("Signed in successfully", "success");
      // Full reload to boot the app dashboard correctly
      window.location.href = "/dashboard";
    } catch (e) {
      showToast("Login failed. Please check the email.", "error");
      submitBtn.textContent = "Sign In Securely";
      submitBtn.disabled = false;
    }
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    if (email) handleLogin(email);
  });

  appEl.querySelectorAll(".demo-role-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      emailInput.value = btn.dataset.email;
      handleLogin(btn.dataset.email);
    });
  });
}
