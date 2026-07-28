export function normalizeContactKey(raw) {
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}

export function generateToken(length = 10) {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789"; // no 0/o/1/l ambiguity
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  let out = "";
  for (let i = 0; i < length; i++) out += chars[values[i] % chars.length];
  return out;
}

export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

export function formatDate(value) {
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}
