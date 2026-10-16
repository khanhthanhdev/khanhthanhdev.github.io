import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
