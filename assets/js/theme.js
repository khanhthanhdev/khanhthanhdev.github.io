// Shared theme helpers used by diagrams, search, tables, and the navigation control.
const themePreference = window.matchMedia("(prefers-color-scheme: dark)");

function determineThemeSetting() {
  try {
    const stored = localStorage.getItem("theme");
    return ["light", "dark", "system"].includes(stored) ? stored : "system";
  } catch (error) {
    return document.documentElement.getAttribute("data-theme-setting") || "system";
  }
}

function determineComputedTheme() {
  const setting = determineThemeSetting();
  return setting === "system" ? (themePreference.matches ? "dark" : "light") : setting;
}

function setThemeSetting(setting) {
  if (!["light", "dark", "system"].includes(setting)) return;
  try {
    localStorage.setItem("theme", setting);
  } catch (error) {}
  document.documentElement.setAttribute("data-theme-setting", setting);
  applyTheme();
}

function applyTheme() {
  const theme = determineComputedTheme();
  document.documentElement.setAttribute("data-theme", theme);
  const light = document.getElementById("highlight_theme_light");
  const dark = document.getElementById("highlight_theme_dark");
  if (light) light.media = theme === "dark" ? "none" : "all";
  if (dark) dark.media = theme === "dark" ? "all" : "none";
  document.querySelector("ninja-keys")?.classList.toggle("dark", theme === "dark");
  document.querySelectorAll("table").forEach((table) => table.classList.toggle("table-dark", theme === "dark"));
  const toggle = document.getElementById("light-toggle");
  if (toggle) {
    const setting = determineThemeSetting();
    const next = { system: "light", light: "dark", dark: "system" }[setting];
    toggle.textContent = `Theme: ${setting}`;
    toggle.setAttribute("aria-label", `Color theme: ${setting}. Switch to ${next}.`);
  }
  window.dispatchEvent(new Event("themechange"));
}

const themeToggle = document.getElementById("light-toggle");
if (themeToggle) {
  themeToggle.hidden = false;
  themeToggle.addEventListener("click", () => {
    setThemeSetting({ system: "light", light: "dark", dark: "system" }[determineThemeSetting()]);
  });
}
themePreference.addEventListener("change", applyTheme);
applyTheme();
