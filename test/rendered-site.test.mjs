import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, access } from "node:fs/promises";
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

test("retained pages exist and the empty blog has readable navigation", async () => {
  for (const route of ["index.html", "works/index.html", "blog/index.html", "cv/index.html", "projects/index.html", "publications/index.html"]) {
    await access(new URL(`../_site/${route}`, import.meta.url));
  }
  const blog = await readFile(new URL("../_site/blog/index.html", import.meta.url), "utf8");
  assert.match(blog, /No posts yet/);
  assert.match(blog, /href="\/blog\/"[^>]*aria-current="page"/);
  assert.doesNotMatch(blog, /life-divider\.mjs|sidenotes\.mjs|mermaid\.min\.js|d3\.min\.js/);
});

test("homepage includes the guarded divider without unused visualization libraries", async () => {
  const html = await readFile(new URL("../_site/index.html", import.meta.url), "utf8");
  assert.match(html, /data-life-divider/);
  assert.match(html, /life-divider\.mjs/);
  assert.match(html, /Pause animation/);
  assert.match(html, /No posts yet/);
  assert.doesNotMatch(html, /masonry|imagesloaded|medium-zoom\.min\.js|jupyter|mdb\.min\.css|fonts\.googleapis|sidenotes\.mjs/);
});

test("removed articles and demos are absent from output and discovery files", async () => {
  for (const route of [
    "blog/2026/interactive-gradient-descent/index.html",
    "blog/2026/mnist-image-classification/index.html",
    "assets/interactive",
    "assets/js/posts/gradient-descent.js",
  ]) {
    await assert.rejects(access(new URL(`../_site/${route}`, import.meta.url)), { code: "ENOENT" });
  }
  for (const path of ["sitemap.xml", "feed.xml", "assets/js/search-data.js"]) {
    const content = await readFile(new URL(`../_site/${path}`, import.meta.url), "utf8");
    assert.doesNotMatch(content, /interactive-gradient-descent|mnist-image-classification|third-party-libraries-demo/);
  }
});

test("personal project drafts and customization documentation stay unpublished", async () => {
  for (const path of [
    "projects/infi_details.md",
    "projects/infi_details/index.html",
    "projects/portfolio-site/index.html",
    "docs",
    "droid-wiki",
    "sophia_website.md",
  ]) {
    await assert.rejects(access(new URL(`../_site/${path}`, import.meta.url)), { code: "ENOENT" });
  }
});

test("native publication and TOC controls no longer load legacy JavaScript", async () => {
  for (const route of ["index.html", "works/index.html", "cv/index.html", "blog/index.html"]) {
    const html = await readFile(new URL(`../_site/${route}`, import.meta.url), "utf8");
    assert.doesNotMatch(html, /jquery|bootstrap\.bundle|bootstrap-toc|\/common\.js|\/no_defer\.js|shortcut-key/);
  }
  const home = await readFile(new URL("../_site/index.html", import.meta.url), "utf8");
  assert.match(home, /<details class="author-details">/);
  assert.doesNotMatch(home, /icons\.css|academicons|scholar-icons/);
  const cv = await readFile(new URL("../_site/cv/index.html", import.meta.url), "utf8");
  assert.match(cv, /toc\.mjs/);
  const works = await readFile(new URL("../_site/works/index.html", import.meta.url), "utf8");
  assert.match(works, /<label for="bibsearch"/);
  assert.match(works, /bibsearch\.js/);
});

test("production build preserves downloaded vendor bundles", async () => {
  const vendorPath = "assets/libs/mathjax/tex-mml-chtml.js";
  const source = await readFile(new URL(`../${vendorPath}`, import.meta.url));
  const output = await readFile(new URL(`../_site/${vendorPath}`, import.meta.url));
  const hash = (content) => createHash("sha256").update(content).digest("hex");
  assert.equal(hash(output), hash(source));
});
