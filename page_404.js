import { navigateTo } from "./router.js";

export function mount404(container) {
  const appEl = document.getElementById("app") || container;
  
  appEl.innerHTML = `
    <div class="not-found-wrapper">
      <div class="not-found-content">
        <h1 class="not-found-title">404</h1>
        <h2 class="not-found-subtitle">Page Not Found</h2>
        <p class="not-found-text">The page you are looking for doesn't exist or has been moved.</p>
        <button type="button" class="btn btn-primary" id="btn-back-home">
          Return to Dashboard
        </button>
      </div>
    </div>
    <style>
      .not-found-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        min-height: 60vh;
        text-align: center;
        padding: 2rem;
      }
      .not-found-title {
        font-size: 6rem;
        font-weight: 800;
        color: var(--accent);
        margin: 0;
        line-height: 1;
        text-shadow: 0 10px 20px var(--accent-alpha);
      }
      .not-found-subtitle {
        font-size: 2rem;
        font-weight: 600;
        color: var(--text-main);
        margin: 1rem 0 0.5rem;
      }
      .not-found-text {
        color: var(--text-muted);
        font-size: 1.1rem;
        margin-bottom: 2rem;
      }
    </style>
  `;

  appEl.querySelector("#btn-back-home").addEventListener("click", () => {
    window.location.href = "/dashboard";
  });
}
