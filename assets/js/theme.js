// Toggle through light, dark, and system theme settings.
let toggleThemeSetting = () => {
  let themeSetting = determineThemeSetting();
  if (themeSetting == "system") {
    setThemeSetting("light");
  } else if (themeSetting == "light") {
    setThemeSetting("dark");
  } else {
    setThemeSetting("system");
  }
};

// Change the theme setting and apply the theme.
let setThemeSetting = (themeSetting, init = false) => {
  try {
    if (localStorage.getItem("theme") !== themeSetting) {
      localStorage.setItem("theme", themeSetting);
    }
  } catch (e) {
    console.debug("localStorage is not available:", e);
  }

  document.documentElement.setAttribute("data-theme-setting", themeSetting);
  applyTheme(init);
};

let applyTheme = (init = false) => {
  let theme = determineComputedTheme();

  if (!init) {
    transTheme();
  }
  setHighlight(theme);
  setGiscusTheme(theme);
  setSearchTheme(theme);
  setCookieConsentTheme(theme);

  if (typeof mermaid !== "undefined") {
    setMermaidTheme(theme);
  }

  document.documentElement.setAttribute("data-theme", theme);

  let tables = document.getElementsByTagName("table");
  for (let i = 0; i < tables.length; i++) {
    if (theme == "dark") {
      tables[i].classList.add("table-dark");
    } else {
      tables[i].classList.remove("table-dark");
    }
  }
};

let setHighlight = (theme) => {
  if (theme == "dark") {
    document.getElementById("highlight_theme_light").media = "none";
    document.getElementById("highlight_theme_dark").media = "";
  } else {
    document.getElementById("highlight_theme_dark").media = "none";
    document.getElementById("highlight_theme_light").media = "";
  }
};

let setGiscusTheme = (theme) => {
  const iframe = document.querySelector("iframe.giscus-frame");
  if (!iframe) return;
  iframe.contentWindow.postMessage({ giscus: { setConfig: { theme } } }, "https://giscus.app");
};

let addMermaidZoom = (records, observer) => {
  var svgs = d3.selectAll(".mermaid svg");
  svgs.each(function () {
    var svg = d3.select(this);
    svg.html("<g>" + svg.html() + "</g>");
    var inner = svg.select("g");
    var zoom = d3.zoom().on("zoom", function (event) {
      inner.attr("transform", event.transform);
    });
    svg.call(zoom);
  });
  observer.disconnect();
};

let setMermaidTheme = (theme) => {
  if (theme == "light") {
    theme = "default";
  }

  document.querySelectorAll(".mermaid").forEach((elem) => {
    let svgCode = elem.previousSibling.childNodes[0].innerHTML;
    elem.removeAttribute("data-processed");
    elem.innerHTML = svgCode;
  });

  mermaid.initialize({ theme: theme });
  window.mermaid.init(undefined, document.querySelectorAll(".mermaid"));

  const observable = document.querySelector(".mermaid svg");
  if (observable !== null) {
    var observer = new MutationObserver(addMermaidZoom);
    observer.observe(observable, { childList: true });
  }
};

let setSearchTheme = (theme) => {
  const ninjaKeys = document.querySelector("ninja-keys");
  if (!ninjaKeys) return;
  ninjaKeys.classList.toggle("dark", theme === "dark");
};

let setCookieConsentTheme = (theme) => {
  document.documentElement.classList.toggle("cc--darkmode", theme === "dark");
};

let transTheme = () => {
  document.documentElement.classList.add("transition");
  window.setTimeout(() => {
    document.documentElement.classList.remove("transition");
  }, 500);
};

// Preserve the site's light-only setting; there is no manual theme toggle.
let determineThemeSetting = () => "light";

let determineComputedTheme = () => {
  let themeSetting = determineThemeSetting();
  if (themeSetting == "system") {
    const userPref = window.matchMedia;
    return userPref && userPref("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return themeSetting;
};

let initTheme = () => {
  setThemeSetting(determineThemeSetting(), true);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    applyTheme();
  });
};

initTheme();
