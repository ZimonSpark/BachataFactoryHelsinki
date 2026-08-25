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

// Returns a compact "Xh XXm XXs" string (or "Xd XXh XXm XXs" past 24h), or null once
// the deadline has passed.
export function formatCountdown(deadlineMs) {
  if (deadlineMs === null) return null;
  const remainingMs = deadlineMs - Date.now();
  if (remainingMs <= 0) return null;
  const totalSec = Math.floor(remainingMs / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const hStr = String(h).padStart(2, "0");
  const mStr = String(m).padStart(2, "0");
  const sStr = String(s).padStart(2, "0");
  return d > 0 ? `${d}d ${hStr}h ${mStr}m ${sStr}s` : `${h}h ${mStr}m ${sStr}s`;
}

// Fixed final deadline for the whole nomination period (not per-dancer), pinned to
// Helsinki time (+03:00, EEST) regardless of the viewer's own timezone.
export const NOMINATION_PERIOD_DEADLINE_MS = new Date("2026-08-23T00:00:00+03:00").getTime();

// The team calendar only ever covers this fixed run of Fridays.
export const CALENDAR_START = "2026-09-18";
export const CALENDAR_END = "2026-11-27";

// Every Friday from start to end (both inclusive, both must already be Fridays), as
// "YYYY-MM-DD" strings. Noon UTC avoids DST-related date-shift edge cases.
export function listFridays(startStr = CALENDAR_START, endStr = CALENDAR_END) {
  const fridays = [];
  const cur = new Date(`${startStr}T12:00:00Z`);
  const end = new Date(`${endStr}T12:00:00Z`);
  while (cur <= end) {
    fridays.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 7);
  }
  return fridays;
}

// "Friday, 18 September 2026"
export function formatFridayLabel(dateStr) {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// "September 2026" — used to group Fridays into monthly sections.
export function formatMonthLabel(dateStr) {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
