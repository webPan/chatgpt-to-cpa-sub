// ─── Shared constants ────────────────────────────────────────────────────────
const DEFAULT_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const DEFAULT_PRIVACY_MODE = "training_off";
const te = new TextEncoder();
const td = new TextDecoder();

// ─── String helpers ───────────────────────────────────────────────────────────
function firstText(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function looksLikeEmail(value) {
  const text = String(value ?? "").trim();
  if (!text || /\s/.test(text)) return false;
  const parts = text.split("@");
  return parts.length === 2 && Boolean(parts[0]) && Boolean(parts[1]);
}

function sanitizeFilename(name, fallback) {
  const cleaned = String(name ?? "").trim().replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "_");
  return cleaned || fallback;
}

// ─── Type coercion ────────────────────────────────────────────────────────────
function coerceTs(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  const text = String(value ?? "").trim();
  if (!text) return 0;
  if (/^-?\d+$/.test(text)) return Math.max(0, parseInt(text, 10));
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? 0 : Math.max(0, Math.trunc(parsed / 1000));
}

// ─── Base64url / JWT helpers ──────────────────────────────────────────────────
function b64uToText(text) {
  let value = String(text ?? "").replace(/-/g, "+").replace(/_/g, "/");
  const remainder = value.length % 4;
  if (remainder) value += "=".repeat(4 - remainder);
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
  return td.decode(bytes);
}

function b64uBytes(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64uJson(value) {
  return b64uBytes(te.encode(JSON.stringify(value)));
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token ?? "").split(".");
    if (parts.length < 2) return {};
    const parsed = JSON.parse(b64uToText(parts[1]));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// ─── Date / filename helpers ──────────────────────────────────────────────────
function pad2(value) { return String(value).padStart(2, "0"); }
function pad3(value) { return String(value).padStart(3, "0"); }

function utc8Date(date) {
  return new Date(date.getTime() + 8 * 3600000);
}

function toIso8(date) {
  const shifted = utc8Date(date);
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}T${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}:${pad2(shifted.getUTCSeconds())}.${pad3(shifted.getUTCMilliseconds())}+08:00`;
}

function formatExportTimestamp(date = new Date()) {
  const shifted = utc8Date(date);
  return `${shifted.getUTCFullYear()}${pad2(shifted.getUTCMonth() + 1)}${pad2(shifted.getUTCDate())}_${pad2(shifted.getUTCHours())}${pad2(shifted.getUTCMinutes())}${pad2(shifted.getUTCSeconds())}`;
}

function exportFileName(count, ext, timestamp = formatExportTimestamp()) {
  const safeCount = Math.max(1, parseInt(count, 10) || 1);
  return `${safeCount}_${timestamp}.${ext}`;
}
