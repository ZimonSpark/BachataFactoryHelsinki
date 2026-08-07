export function normalizeKey(raw) {
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

export const NOMINATION_WINDOW_HOURS = 48;

function toMillis(value) {
  if (!value) return null;
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

// Every invite's nomination window starts the moment the dancer was approved (that's
// when invite.html becomes reachable for them), not when the record was created.
export function nominationDeadlineMs(approvedAt) {
  const start = toMillis(approvedAt);
  return start === null ? null : start + NOMINATION_WINDOW_HOURS * 3600 * 1000;
}

// Returns a compact "Xh XXm XXs" string, or null once the deadline has passed.
export function formatCountdown(deadlineMs) {
  if (deadlineMs === null) return null;
  const remainingMs = deadlineMs - Date.now();
  if (remainingMs <= 0) return null;
  const totalSec = Math.floor(remainingMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}
