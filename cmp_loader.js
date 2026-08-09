export function initGlobalLoader() {
  if (document.getElementById("global-loader")) return;

  const loader = document.createElement("div");
  loader.id = "global-loader";
  loader.className = "global-loader-overlay";
  loader.innerHTML = `
    <div class="global-loader-spinner"></div>
    <style>
      .global-loader-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(255, 255, 255, 0.7);
        backdrop-filter: blur(4px);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.3s ease, visibility 0.3s ease;
      }
      .global-loader-overlay.is-active {
        opacity: 1;
        visibility: visible;
      }
      .global-loader-spinner {
        width: 48px;
        height: 48px;
        border: 4px solid var(--accent-alpha, rgba(59, 130, 246, 0.2));
        border-top-color: var(--accent, #3b82f6);
        border-radius: 50%;
        animation: globalLoaderSpin 1s linear infinite;
      }
      @keyframes globalLoaderSpin {
        to { transform: rotate(360deg); }
      }
      .theme-dark .global-loader-overlay {
        background: rgba(15, 23, 42, 0.7);
      }
    </style>
  `;
  document.body.appendChild(loader);

  let reqCount = 0;
  window.addEventListener("api-request-start", () => {
    reqCount++;
    if (reqCount > 0) loader.classList.add("is-active");
  });

  window.addEventListener("api-request-end", () => {
    reqCount = Math.max(0, reqCount - 1);
    if (reqCount === 0) loader.classList.remove("is-active");
  });
}

export function showLoader() {
  window.dispatchEvent(new Event("api-request-start"));
}

export function hideLoader() {
  window.dispatchEvent(new Event("api-request-end"));
}
