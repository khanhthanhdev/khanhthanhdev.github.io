function initToc(container) {
  const sidebar = container.querySelector("#toc-sidebar");
  const nav = sidebar.querySelector("#toc-sidebar-nav");
  const article = container.querySelector(".toc-main-content");
  const closeButton = container.querySelector("#close-sidebar-btn");
  const openButton = container.querySelector("#open-sidebar-btn");
  const headings = [...article.querySelectorAll("h2, h3")].filter(
    (heading) => !heading.closest(".publications, [data-toc-skip]") && heading.textContent.trim()
  );

  if (!headings.length) {
    container.classList.add("toc-empty");
    sidebar.parentElement.hidden = true;
    return;
  }

  const list = document.createElement("ul");
  list.className = "nav";
  const links = new Map();
  let parentItem = null;
  for (const [index, heading] of headings.entries()) {
    if (!heading.id) {
      const slug =
        heading.textContent
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "section";
      let id = `toc-${slug}`;
      while (document.getElementById(id)) id += `-${index + 1}`;
      heading.id = id;
    }
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.className = "nav-link";
    link.href = `#${encodeURIComponent(heading.id)}`;
    link.textContent = heading.textContent;
    item.append(link);
    links.set(heading.id, link);
    if (heading.tagName === "H3" && parentItem) {
      let nested = parentItem.querySelector("ul");
      if (!nested) {
        nested = document.createElement("ul");
        nested.className = "nav";
        parentItem.append(nested);
      }
      nested.append(item);
    } else {
      list.append(item);
      if (heading.tagName === "H2") parentItem = item;
    }
  }
  nav.append(list);

  function setActive(id) {
    for (const [key, link] of links) {
      link.classList.toggle("active", key === id);
      if (key === id) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  }

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: "-5% 0px -65% 0px" }
    );
    headings.forEach((heading) => observer.observe(heading));
  }

  const desktop = matchMedia("(min-width: 992px)");
  let userChoice = null;
  function setOpen(open, restoreFocus = false) {
    sidebar.hidden = !open;
    sidebar.classList.toggle("toc-sidebar-hidden", !open);
    container.classList.toggle("toc-collapsed", !open);
    openButton.hidden = open;
    closeButton.hidden = !open;
    openButton.setAttribute("aria-expanded", String(open));
    closeButton.setAttribute("aria-expanded", String(open));
    if (restoreFocus) openButton.focus();
  }

  closeButton.addEventListener("click", () => {
    userChoice = false;
    setOpen(false, true);
  });
  openButton.addEventListener("click", () => {
    userChoice = true;
    setOpen(true);
    closeButton.focus();
  });
  sidebar.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      userChoice = false;
      setOpen(false, true);
    }
  });
  nav.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link) return;
    setActive(decodeURIComponent(link.hash.slice(1)));
    if (!desktop.matches) {
      userChoice = false;
      setOpen(false);
    }
  });
  desktop.addEventListener("change", () => setOpen(userChoice ?? desktop.matches));
  setOpen(desktop.matches);
}

document.querySelectorAll(".toc-sidebar-container").forEach(initToc);
