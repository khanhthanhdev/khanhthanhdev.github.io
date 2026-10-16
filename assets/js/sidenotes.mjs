// Return null when the article cannot contain every note without overlap.
export function positionSidenotes(notes, articleHeight, gap = 12) {
  let bottom = -gap;
  const tops = notes.map(({ anchor, height }) => {
    const top = Math.max(0, anchor, bottom + gap);
    bottom = top + height;
    return top;
  });
  let limit = articleHeight;
  for (let i = notes.length - 1; i >= 0; i--) {
    tops[i] = Math.min(tops[i], limit - notes[i].height);
    limit = tops[i] - gap;
  }
  return tops.some((top) => top < 0) ? null : tops;
}

function initSidenotes(article) {
  const footnotes = article.querySelector(".footnotes");
  const list = footnotes?.querySelector("ol");
  if (!list) return;
  const notes = [...list.children];
  const references = notes.map((note) =>
    [...article.querySelectorAll("a.footnote")].find((ref) => decodeURIComponent(ref.hash.slice(1)) === note.id)
  );
  if (references.some((ref) => !ref)) return;
  const desktop = matchMedia("(min-width: 1280px)");
  let frame = null;

  function reset() {
    article.classList.remove("has-sidenotes");
    notes.forEach((note) => note.style.removeProperty("--sidenote-top"));
  }

  function layout() {
    frame = null;
    reset();
    if (!desktop.matches) return;
    const rect = article.getBoundingClientRect();
    if (rect.right + 252 > document.documentElement.clientWidth - 24) return;

    // Measure at margin width; hide the endnote container only after measuring prose.
    const proseHeight = Math.max(0, footnotes.getBoundingClientRect().top - rect.top);
    article.classList.add("has-sidenotes");
    const positions = positionSidenotes(
      notes.map((note, i) => ({
        anchor: references[i].getBoundingClientRect().top - rect.top,
        height: note.getBoundingClientRect().height,
      })),
      proseHeight
    );
    if (!positions || notes.some((note) => note.getBoundingClientRect().height === 0)) {
      reset();
      return;
    }
    notes.forEach((note, i) => note.style.setProperty("--sidenote-top", `${positions[i]}px`));
  }

  function schedule() {
    if (frame === null) frame = requestAnimationFrame(layout);
  }

  desktop.addEventListener("change", schedule);
  window.addEventListener("resize", schedule);
  article.addEventListener("load", schedule, true);
  if (document.fonts) document.fonts.ready.then(schedule);
  if ("ResizeObserver" in window) {
    // Observing both container and notes covers math rendering and late image loads.
    const observer = new ResizeObserver(schedule);
    observer.observe(article);
    notes.forEach((note) => observer.observe(note));
  }
  schedule();
}

if (typeof document !== "undefined") document.querySelectorAll("[data-sidenotes]").forEach(initSidenotes);
