/** Photo URL validation and optional Cloudinary upload */

import { validateUrl } from "./cmp_projectTab.js";

export function validatePhotoUrl(url) {
  const s = String(url || "").trim();
  if (!s) return { ok: false, message: "Photo URL required" };
  return validateUrl(url);
}

export function addPhotoToDiary(diary, url, caption = "") {
  const check = validatePhotoUrl(url);
  if (!check.ok) throw new Error(check.message);
  const photos = [...(diary.photos || [])];
  photos.push({ url: String(url).trim(), caption: String(caption || "").trim() });
  return { ...diary, photos };
}

export async function uploadPhoto(file) {
  const preset = typeof window !== "undefined" && window.CLOUDINARY_UPLOAD_PRESET;
  const cloudName = typeof window !== "undefined" && window.CLOUDINARY_CLOUD_NAME;
  if (!preset || !cloudName) {
    throw new Error("Photo upload not configured — paste an image URL instead");
  }
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", preset);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) throw new Error("Upload failed");
  const data = await res.json();
  return data.secure_url;
}
