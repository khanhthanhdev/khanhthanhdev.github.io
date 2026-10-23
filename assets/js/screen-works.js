// Scroll-in build for .sw-fig figures (Screen Works motion: short fade + rise, one sibling per stagger step).
(function () {
  var root = document.documentElement;
  var figs = document.querySelectorAll(".sw-fig");
  if (!figs.length) return;

  if (!("IntersectionObserver" in window)) return; // no .sw-js class, so everything stays visible
  root.classList.add("sw-js");

  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.3 }
  );

  figs.forEach(function (fig) {
    fig.querySelectorAll(".sw-build").forEach(function (group) {
      Array.prototype.forEach.call(group.children, function (child, i) {
        child.style.setProperty("--i", i);
        // bar rows are display: contents, so number their cells too
        if (child.classList.contains("sw-bar-row")) {
          Array.prototype.forEach.call(child.children, function (cell) {
            cell.style.setProperty("--i", i);
          });
        }
      });
    });
    io.observe(fig);
  });
})();
