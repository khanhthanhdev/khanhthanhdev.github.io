import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

function textContent(html) {
  return html
    .replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

test("homepage is server-rendered with an H1 and substantial readable content", async () => {
  const homepage = await readFile(new URL("../_site/index.html", import.meta.url), "utf8");
  const readableContent = textContent(homepage);

  assert.match(homepage, /<h1\b[^>]*>[\s\S]*?Tran[\s\S]*?Khanh[\s\S]*?Thanh[\s\S]*?<\/h1>/i);
  assert.ok(readableContent.length > 500);
  assert.match(readableContent, /Work and interests/);
});

test("rendered 404 points agents to recovery resources without redirecting", async () => {
  const notFoundPage = await readFile(new URL("../_site/404.html", import.meta.url), "utf8");

  assert.doesNotMatch(notFoundPage, /http-equiv="refresh"/i);
  assert.match(notFoundPage, /sitemap\.xml/);
  assert.match(notFoundPage, /llms\.txt/);
});

test("main pages skip unused diagram, grid, and notebook scripts", async () => {
  for (const route of ["index.html", "works/index.html", "cv/index.html", "blog/index.html"]) {
    const html = await readFile(new URL(`../_site/${route}`, import.meta.url), "utf8");
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi)].map((match) => match[1]);

    assert.ok(!scripts.some((src) => /mermaid|\/d3\/|masonry|imagesloaded|jupyter_new_tab/.test(src)), route);
    assert.ok(
      scripts.some((src) => src.includes("theme.js")),
      `${route} keeps theme support`
    );
    assert.match(html, /openSearchModal/, `${route} keeps search`);
  }
});

test("project pages keep the scripts their content needs", async () => {
  const html = await readFile(new URL("../_site/projects/6dof-robot-policy/index.html", import.meta.url), "utf8");

  assert.match(html, /src="[^"]*\/mermaid\/mermaid\.min\.js/);
  assert.match(html, /src="[^"]*\/d3\/d3\.min\.js/);
  assert.match(html, /src="[^"]*\/mermaid-setup\.js/);
  assert.match(html, /src="[^"]*\/copy_code\.js/);
  assert.doesNotMatch(html, /src="[^"]*\/zoom\.js/);

  const imageProject = await readFile(new URL("../_site/projects/infi/index.html", import.meta.url), "utf8");
  assert.match(imageProject, /src="[^"]*\/zoom\.js/);
});

test("rendered local scripts exist and match their browser integrity checks", async () => {
  for (const route of ["index.html", "projects/6dof-robot-policy/index.html", "projects/infi/index.html"]) {
    const html = await readFile(new URL(`../_site/${route}`, import.meta.url), "utf8");
    for (const [tag] of html.matchAll(/<script\b[^>]*>/gi)) {
      const src = tag.match(/\bsrc="([^"]+)"/)?.[1];
      if (!src?.startsWith("/") || src.startsWith("//")) continue;

      const path = new URL(src, "https://example.test").pathname;
      const script = await readFile(new URL(`../_site${path}`, import.meta.url));
      const integrity = tag.match(/\bintegrity="([^"]+)"/)?.[1];
      if (!integrity) continue;

      const valid = integrity.split(/\s+/).some((hash) => {
        const [algorithm, expected] = hash.split("-");
        return createHash(algorithm).update(script).digest("base64") === expected;
      });
      assert.ok(valid, `${route}: ${path} must not be altered after its integrity hash is calculated`);
    }
  }
});

test("production output excludes template samples and development files", async () => {
  for (const path of [
    "books",
    "teachings",
    "AGENTS.md",
    "sophia_website.md",
    "droid-wiki",
    "edge",
    "test",
    "wrangler.jsonc",
    "assets/rendercv",
    "assets/video/tutorial_al_folio.mp4",
    "assets/plotly",
    "assets/js/tikzjax.min.js",
    "assets/js/distillpub",
    "assets/interactive",
    "assets/jupyter",
    "assets/libs/bootstrap-table",
    "assets/libs/imagesloaded",
    "assets/libs/masonry",
    "assets/libs/mathjax",
    "assets/libs/mdb",
    "assets/libs/polyfill",
    "assets/css/bootstrap.min.css.map",
  ]) {
    await assert.rejects(access(new URL(`../_site/${path}`, import.meta.url)), { code: "ENOENT" }, path);
  }
});

test("removed interactive articles are absent from the blog and discovery indexes", async () => {
  const articles = ["interactive-gradient-descent", "interactive-ml-article-system", "mnist-image-classification"];
  for (const article of articles) {
    await assert.rejects(access(new URL(`../_site/blog/2026/${article}/index.html`, import.meta.url)), { code: "ENOENT" });
  }
  for (const path of ["blog/index.html", "assets/js/search-data.js", "feed.xml", "sitemap.xml"]) {
    const content = await readFile(new URL(`../_site/${path}`, import.meta.url), "utf8");
    for (const article of articles) assert.ok(!content.includes(article), `${path}: ${article}`);
  }
});
