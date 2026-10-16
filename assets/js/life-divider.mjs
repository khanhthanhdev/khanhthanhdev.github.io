export function stepLife(cells, width, height) {
  const next = new Uint8Array(cells.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx || dy) neighbors += cells[((y + dy + height) % height) * width + ((x + dx + width) % width)];
        }
      }
      const index = y * width + x;
      next[index] = Number(neighbors === 3 || (cells[index] === 1 && neighbors === 2));
    }
  }
  return next;
}

export function canAnimateLife({ visible, hidden, reduced, paused }) {
  return visible && !hidden && !reduced && !paused;
}

function initLife(divider) {
  const canvas = divider.querySelector("canvas");
  const context = canvas.getContext("2d");
  if (!context) return;
  const button = divider.querySelector("[data-life-toggle]");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const height = 16;
  let width;
  let cells;
  let timer = null;
  let visible = false;
  let paused = false;

  function draw() {
    context.clearRect(0, 0, width, height);
    context.fillStyle = getComputedStyle(divider).getPropertyValue("--global-theme-color").trim();
    for (let i = 0; i < cells.length; i++) {
      if (cells[i]) context.fillRect(i % width, Math.floor(i / width), 1, 1);
    }
  }

  function resize() {
    const nextWidth = Math.max(8, Math.floor(divider.clientWidth / 4));
    if (width === nextWidth) return;
    width = nextWidth;
    canvas.width = width;
    canvas.height = height;
    cells = Uint8Array.from({ length: width * height }, () => Number(Math.random() < 0.18));
    draw();
  }

  function update() {
    clearInterval(timer);
    timer = null;
    if (canAnimateLife({ visible, hidden: document.hidden, reduced: motion.matches, paused })) {
      timer = setInterval(() => {
        cells = stepLife(cells, width, height);
        draw();
      }, 120);
    }
    button.hidden = motion.matches;
    button.textContent = paused ? "Resume animation" : "Pause animation";
    button.setAttribute("aria-pressed", String(paused));
  }

  resize();
  canvas.hidden = false;
  divider.querySelector("[data-life-fallback]").style.display = "none";
  button.addEventListener("click", () => {
    paused = !paused;
    update();
  });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    }).observe(divider);
  } else {
    visible = true;
  }
  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(divider);
  else window.addEventListener("resize", resize);
  new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  document.addEventListener("visibilitychange", update);
  motion.addEventListener("change", update);
  window.addEventListener("pagehide", () => clearInterval(timer));
  window.addEventListener("pageshow", update);
  update();
}

if (typeof document !== "undefined") document.querySelectorAll("[data-life-divider]").forEach(initLife);
