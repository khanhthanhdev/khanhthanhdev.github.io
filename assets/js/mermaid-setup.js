let mermaidTheme = determineComputedTheme();

/* Create mermaid diagram as another node and hide the code block, appending the mermaid node after it
    this is done to enable retrieving the code again when changing theme between light/dark */
document.addEventListener("readystatechange", () => {
  if (document.readyState === "complete") {
    document.querySelectorAll("pre>code.language-mermaid").forEach((elem) => {
      const svgCode = elem.textContent;
      const backup = elem.parentElement;
      backup.classList.add("unloaded");
      /* create mermaid node */
      let mermaid = document.createElement("pre");
      mermaid.classList.add("mermaid");
      const text = document.createTextNode(svgCode);
      mermaid.appendChild(text);
      backup.after(mermaid);
    });

    mermaid.initialize({ theme: mermaidTheme });

    /* Make mermaid diagrams clickable to open in lightbox */
    if (typeof d3 !== "undefined") {
      window.addEventListener("load", function () {
        d3.selectAll(".mermaid svg").each(function () {
          this.style.cursor = "zoom-in";
          this.addEventListener("dblclick", function (e) {
            e.preventDefault();
            openMermaidLightbox(this);
          });
        });
      });
    }
  }
});

/* Mermaid lightbox: opens a fullscreen overlay with a zoomable clone of the diagram */
function openMermaidLightbox(svgElement) {
  /* Prevent multiple overlays */
  if (document.querySelector(".mermaid-lightbox")) return;

  var overlay = document.createElement("div");
  overlay.className = "mermaid-lightbox";

  var bg = getComputedStyle(document.documentElement).getPropertyValue("--global-bg-color").trim();
  if (!bg) bg = "#fff";
  overlay.style.cssText =
    "position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999;" +
    "background:" +
    bg +
    "ee;display:flex;align-items:center;justify-content:center;" +
    "cursor:zoom-out;overflow:hidden;";

  /* Clone the SVG */
  var container = document.createElement("div");
  container.style.cssText = "width:90vw;height:90vh;cursor:grab;overflow:hidden;";
  var clonedSvg = svgElement.cloneNode(true);
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
  clonedSvg.setAttribute("width", containerW);
  clonedSvg.setAttribute("height", containerH);
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
