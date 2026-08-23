import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { handleRequest, preferredRepresentation } from "../edge/agentic-worker.mjs";

const assets = new Map([
  [
    "/",
    {
      body: "<!doctype html><html><body><h1>Tran Khanh Thanh</h1><p>Server-rendered homepage.</p></body></html>",
      contentType: "text/html; charset=utf-8",
      headers: { Vary: "Accept-Encoding" },
    },
  ],
  [
    "/404.html",
    {
      body: "<!doctype html><html><body><h1>Page not found</h1></body></html>",
      contentType: "text/html; charset=utf-8",
    },
  ],
  [
    "/agent-content/home.md",
    {
      body: "# Tran Khanh Thanh\n\nServer-rendered homepage summary.\n",
      contentType: "text/markdown; charset=utf-8",
    },
  ],
  [
    "/agent-content/404.md",
    {
      body: "# Page not found\n\nSee [the sitemap](/sitemap.xml).\n",
      contentType: "text/markdown; charset=utf-8",
    },
  ],
  [
    "/openapi.json",
    {
      body: JSON.stringify({ openapi: "3.1.1" }),
      contentType: "application/json; charset=utf-8",
    },
  ],
  [
    "/.well-known/api-catalog",
    {
      body: JSON.stringify({ linkset: [] }),
      contentType: "application/octet-stream",
    },
  ],
  [
    "/llms.txt",
    {
      body: "# Agent index\n",
      contentType: "text/plain; charset=utf-8",
    },
  ],
]);

function environment() {
  return {
    ASSETS: {
      fetch(request) {
        const asset = assets.get(new URL(request.url).pathname);
        if (!asset) {
          return new Response("Missing asset", { status: 404 });
        }

        return new Response(request.method === "HEAD" ? null : asset.body, {
          headers: {
            "Content-Type": asset.contentType,
            ...asset.headers,
          },
        });
      },
    },
  };
}

function request(path, options = {}) {
  return new Request(`https://khanhthanhdev.github.io${path}`, options);
}

test("negotiates text/markdown according to quality values and exclusions", () => {
  assert.equal(preferredRepresentation(null), "text/html");
  assert.equal(preferredRepresentation("*/*"), "text/html");
  assert.equal(preferredRepresentation("text/markdown"), "text/markdown");
  assert.equal(preferredRepresentation("text/markdown, text/html;q=0.8"), "text/markdown");
  assert.equal(preferredRepresentation("text/html, text/markdown;q=0.8"), "text/html");
  assert.equal(preferredRepresentation("text/markdown;q=0, text/html"), "text/html");
  assert.equal(preferredRepresentation("application/json"), null);
});

test("returns markdown at the homepage only when it is preferred", async () => {
  const markdown = await handleRequest(request("/", { headers: { Accept: "text/markdown, text/html;q=0.8" } }), environment());
  assert.equal(markdown.status, 200);
  assert.match(markdown.headers.get("Content-Type"), /^text\/markdown; charset=utf-8$/);
  assert.equal(markdown.headers.get("Vary"), "Accept, Accept-Encoding");
  assert.match(await markdown.text(), /^# Tran Khanh Thanh/m);

  const html = await handleRequest(request("/", { headers: { Accept: "text/html" } }), environment());
  assert.equal(html.status, 200);
  assert.match(html.headers.get("Content-Type"), /^text\/html; charset=utf-8$/);
  assert.equal(html.headers.get("Vary"), "Accept-Encoding, Accept");
  assert.match(await html.text(), /<h1>Tran Khanh Thanh<\/h1>/);
});

test("rejects an unsupported requested representation", async () => {
  const response = await handleRequest(request("/", { headers: { Accept: "application/json" } }), environment());
  assert.equal(response.status, 406);
  assert.match(response.headers.get("Vary"), /Accept/i);
});

test("returns recoverable 404 bodies in the negotiated representation", async () => {
  const markdown = await handleRequest(request("/missing", { headers: { Accept: "text/markdown" } }), environment());
  assert.equal(markdown.status, 404);
  assert.equal(markdown.statusText, "Not Found");
  assert.match(markdown.headers.get("Content-Type"), /^text\/markdown; charset=utf-8$/);
  assert.match(await markdown.text(), /sitemap/);

  const html = await handleRequest(request("/missing"), environment());
  assert.equal(html.status, 404);
  assert.match(html.headers.get("Content-Type"), /^text\/html; charset=utf-8$/);
  assert.match(await html.text(), /Page not found/);
});

test("returns documented JSON success and error responses for the API", async () => {
  const success = await handleRequest(request("/api/site"), environment());
  assert.equal(success.status, 200);
  assert.match(success.headers.get("Content-Type"), /^application\/json; charset=utf-8$/);
  assert.equal((await success.json()).name, "Tran Khanh Thanh");

  const missing = await handleRequest(request("/api/unknown"), environment());
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), {
    error: {
      code: "not_found",
      message: "No API resource matches this path.",
      resolution: "Fetch /openapi.json to discover supported resources; GET /api/site is the available API resource.",
    },
  });

  const wrongMethod = await handleRequest(request("/api/site", { method: "POST" }), environment());
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("Allow"), "GET, HEAD");
  assert.equal((await wrongMethod.json()).error.code, "method_not_allowed");
});

test("publishes a parseable OpenAPI document for the implemented endpoint", async () => {
  const specification = JSON.parse(await readFile(new URL("../openapi.json", import.meta.url), "utf8"));
  assert.equal(specification.openapi, "3.1.1");
  assert.ok(specification.paths["/api/site"].get);
  assert.ok(specification.components.schemas.Error);

  const response = await handleRequest(request("/openapi.json"), environment());
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Type"), /^application\/json/);
});

test("serves the API catalog as a Linkset JSON document", async () => {
  const response = await handleRequest(request("/.well-known/api-catalog"), environment());
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Type"), /^application\/linkset\+json; charset=utf-8$/);
  assert.deepEqual(await response.json(), { linkset: [] });
});

test("passes non-page assets through without representation negotiation", async () => {
  const response = await handleRequest(request("/llms.txt", { headers: { Accept: "text/markdown" } }), environment());
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Type"), /^text\/plain/);
  assert.equal(response.headers.get("Vary"), null);
});

test("publishes substantial agent-readable homepage content and a recoverable 404 page", async () => {
  const [homepage, notFoundPage] = await Promise.all([
    readFile(new URL("../agent-content/home.md", import.meta.url), "utf8"),
    readFile(new URL("../_pages/404.md", import.meta.url), "utf8"),
  ]);

  assert.match(homepage, /^# Tran Khanh Thanh$/m);
  assert.ok(homepage.length > 500);
  assert.doesNotMatch(notFoundPage, /^redirect:/m);
  assert.match(notFoundPage, /\[sitemap\]/i);
  assert.match(notFoundPage, /\[agent index\]/i);
});
