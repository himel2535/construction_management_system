/** Reusable photo URL input + thumbnail grid for site diaries */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {object[]} photos — [{ url, caption }]
 * @param {{ onChange?: (photos: object[]) => void }} handlers
 */
export function renderPhotoGallery(photos = [], handlers = {}) {
  let list = [...photos];
  const wrap = document.createElement("div");
  wrap.className = "photo-gallery";

  function renderGrid() {
    const grid = wrap.querySelector(".photo-gallery-grid");
    if (!grid) return;
    grid.innerHTML = list.length
      ? list
          .map(
            (p, i) => `
        <figure class="photo-gallery-item" data-idx="${i}">
          <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">
            <img src="${escapeHtml(p.url)}" alt="${escapeHtml(p.caption || "Site photo")}" loading="lazy" />
          </a>
          ${p.caption ? `<figcaption>${escapeHtml(p.caption)}</figcaption>` : ""}
          <button type="button" class="btn btn-ghost btn-sm photo-gallery-remove" data-idx="${i}">Remove</button>
        </figure>`
          )
          .join("")
      : `<p class="proj-empty photo-gallery-empty">No photos yet</p>`;
    grid.querySelectorAll(".photo-gallery-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        list = list.filter((_, idx) => idx !== Number(btn.dataset.idx));
        handlers.onChange?.(list);
        renderGrid();
      });
    });
  }

  wrap.innerHTML = `
    <div class="photo-gallery-add">
      <input type="url" class="photo-gallery-url" placeholder="Photo URL (https://…)" />
      <input type="text" class="photo-gallery-caption" placeholder="Caption (optional)" />
      <button type="button" class="btn btn-ghost btn-sm photo-gallery-add-btn">Add photo</button>
    </div>
    <div class="photo-gallery-grid"></div>
  `;

  wrap.querySelector(".photo-gallery-add-btn")?.addEventListener("click", () => {
    const url = wrap.querySelector(".photo-gallery-url")?.value?.trim();
    const caption = wrap.querySelector(".photo-gallery-caption")?.value?.trim() || "";
    if (!url) return;
    list.push({ url, caption });
    handlers.onChange?.(list);
    wrap.querySelector(".photo-gallery-url").value = "";
    wrap.querySelector(".photo-gallery-caption").value = "";
    renderGrid();
  });

  renderGrid();
  wrap.getPhotos = () => list;
  wrap.setPhotos = (next) => {
    list = [...(next || [])];
    renderGrid();
  };
  return wrap;
}
