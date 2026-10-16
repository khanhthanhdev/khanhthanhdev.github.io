document.querySelectorAll("pre").forEach((block) => {
  const code = block.querySelector("code");
  if (!code || code.classList.contains("language-mermaid") || block.parentElement.closest("pre")) return;
  const button = document.createElement("button");
  button.className = "copy";
  button.type = "button";
  button.textContent = "Copy";
  button.setAttribute("aria-label", "Copy code to clipboard");
  button.setAttribute("aria-live", "polite");
  button.addEventListener("click", async () => {
    try {
      const source = block.querySelector("pre:not(.lineno)") || code;
      await navigator.clipboard.writeText(source.textContent);
      button.textContent = "Copied";
    } catch (error) {
      button.textContent = "Copy failed";
    }
    setTimeout(() => {
      button.textContent = "Copy";
    }, 3000);
  });
  const wrapper = document.createElement("div");
  wrapper.className = "code-display-wrapper";
  block.before(wrapper);
  wrapper.append(block, button);
});
