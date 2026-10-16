// Keep the source blocks intact for rerendering after a theme change.
let diagramRender = Promise.resolve();
function renderDiagrams() {
  diagramRender = diagramRender
    .then(async () => {
      const theme = determineComputedTheme() === "dark" ? "dark" : "default";
      const diagrams = [];
      document.querySelectorAll("pre > code.language-mermaid").forEach((code) => {
        const source = code.parentElement;
        source.classList.add("unloaded");
        let diagram = source.nextElementSibling;
        if (!diagram?.classList.contains("mermaid")) {
          diagram = document.createElement("pre");
          diagram.className = "mermaid";
          source.after(diagram);
        }
        diagram.removeAttribute("data-processed");
        diagram.textContent = code.textContent;
        diagrams.push(diagram);
      });
      mermaid.initialize({ startOnLoad: false, theme });
      await mermaid.run({ nodes: diagrams });
      diagrams.forEach((diagram) => {
        const svg = diagram.querySelector("svg");
        if (svg && typeof d3 !== "undefined") {
          svg.style.cursor = "zoom-in";
          svg.addEventListener("dblclick", () => openMermaidLightbox(svg));
        }
      });
    })
    .catch((error) => console.warn("Could not render diagram", error));
}
window.addEventListener("themechange", renderDiagrams);
renderDiagrams();

/* Mermaid lightbox: opens a fullscreen overlay with a zoomable clone of the diagram */
function openMermaidLightbox(svgElement) {
  /* Prevent multiple overlays */
  if (document.querySelector(".mermaid-lightbox")) return;

  var overlay = document.createElement("div");
  overlay.className = "mermaid-lightbox";

  var isDark = document.documentElement.getAttribute("data-theme") === "dark" || document.documentElement.classList.contains("dark-mode");
  var overlayBg = isDark ? "rgba(18,18,18,0.92)" : "rgba(255,255,255,0.92)";
  overlay.style.cssText =
    "position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999;" +
    "background:" +
    overlayBg +
    ";" +
    "backdrop-filter:blur(16px) saturate(1.2);-webkit-backdrop-filter:blur(16px) saturate(1.2);" +
    "display:flex;align-items:center;justify-content:center;" +
    "cursor:zoom-out;overflow:hidden;";

  /* Clone the SVG */
  var container = document.createElement("div");
  container.style.cssText = "width:90vw;height:90vh;cursor:grab;overflow:hidden;";
  var clonedSvg = svgElement.cloneNode(true);
  /* Remove original inline size constraints so the clone can fill the container */
  clonedSvg.removeAttribute("style");
  clonedSvg.removeAttribute("width");
  clonedSvg.removeAttribute("height");
  clonedSvg.style.width = "100%";
  clonedSvg.style.height = "100%";
  container.appendChild(clonedSvg);
  overlay.appendChild(container);

  /* Close button */
  var closeBtn = document.createElement("button");
  closeBtn.innerHTML = "&times;";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.style.cssText =
    "position:fixed;top:16px;right:24px;z-index:10000;font-size:32px;" +
    "background:none;border:none;cursor:pointer;line-height:1;" +
    "color:var(--global-text-color,#333);padding:4px 12px;";
  overlay.appendChild(closeBtn);

  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  /* D3 zoom on the cloned SVG in the lightbox */
  var d3Svg = d3.select(clonedSvg);
  d3Svg.html("<g>" + d3Svg.html() + "</g>");
  var inner = d3Svg.select("g");

  /* Read the SVG's original viewBox to get its native size */
  var viewBox = clonedSvg.getAttribute("viewBox");
  var svgW, svgH;
  if (viewBox) {
    var parts = viewBox.split(/[\s,]+/).map(Number);
    svgW = parts[2];
    svgH = parts[3];
  } else {
    var bbox = clonedSvg.getBBox();
    svgW = bbox.width;
    svgH = bbox.height;
  }

  /* Size the SVG to fill the container, then compute a scale to fit */
  var containerW = container.clientWidth;
  var containerH = container.clientHeight;
  if (!viewBox) {
    clonedSvg.setAttribute("viewBox", "0 0 " + svgW + " " + svgH);
  }

  /* Calculate scale and translation to center the diagram at max size */
  var scale = Math.min(containerW / svgW, containerH / svgH) * 0.95; /* 95% to leave a small margin */
  var tx = (containerW - svgW * scale) / 2;
  var ty = (containerH - svgH * scale) / 2;

  var zoom = d3.zoom().on("zoom", function (event) {
    inner.attr("transform", event.transform);
  });
  d3Svg.call(zoom);
  d3Svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  d3Svg.style("cursor", "grab");

  /* Remove D3's default dblclick-zoom inside lightbox */
  d3Svg.on("dblclick.zoom", null);

  function closeLightbox() {
    overlay.remove();
    document.body.style.overflow = "";
  }

  /* Close on background click or close button */
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay || e.target === closeBtn) closeLightbox();
  });
  closeBtn.addEventListener("click", closeLightbox);

  /* Close on Escape key */
  function onKeyDown(e) {
    if (e.key === "Escape") {
      closeLightbox();
      document.removeEventListener("keydown", onKeyDown);
    }
  }
  document.addEventListener("keydown", onKeyDown);
}
