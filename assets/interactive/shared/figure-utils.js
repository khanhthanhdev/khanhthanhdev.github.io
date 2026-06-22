export function fmt(value, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : "n/a";
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function cssVar(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function onReady(callback) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", callback, { once: true });
  } else {
    callback();
  }
}
