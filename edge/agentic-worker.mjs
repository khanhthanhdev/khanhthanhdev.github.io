const HTML = "text/html";
const MARKDOWN = "text/markdown";
const JSON_MEDIA_TYPE = "application/json";

const MARKDOWN_VARIANTS = new Map([
  ["/", "/agent-content/home.md"],
  ["/index.html", "/agent-content/home.md"],
  ["/404.html", "/agent-content/404.md"],
]);

const SITE_DISCOVERY = {
  name: "Tran Khanh Thanh",
  description:
    "Academic website of Tran Khanh Thanh, an Electrical and Computer Engineering student at VinUniversity working on AI agents, robotics, and systems.",
  homepage: "https://khanhthanhdev.github.io/",
  resources: [
    {
      name: "Agent index",
      url: "https://khanhthanhdev.github.io/llms.txt",
      mediaType: "text/plain",
    },
    {
      name: "Sitemap",
      url: "https://khanhthanhdev.github.io/sitemap.xml",
      mediaType: "application/xml",
    },
    {
      name: "OpenAPI description",
      url: "https://khanhthanhdev.github.io/openapi.json",
      mediaType: "application/json",
    },
  ],
};

function parseAccept(accept) {
  return accept.split(",").flatMap((rawEntry, index) => {
    const [mediaRange, ...parameters] = rawEntry.trim().split(";");
    const [type, subtype] = (mediaRange || "").trim().toLowerCase().split("/");

    if (!type || !subtype || parameters.some((parameter) => parameter.trim() === "")) {
      return [];
    }

    let quality = 1;
    for (const parameter of parameters) {
      const [name, value] = parameter.trim().split("=", 2);
      if (name?.toLowerCase() !== "q") {
        continue;
      }

      const parsedQuality = Number(value);
      if (!Number.isFinite(parsedQuality) || parsedQuality < 0 || parsedQuality > 1) {
        return [];
      }
      quality = parsedQuality;
    }

    return [{ type, subtype, quality, index }];
  });
}

function matchSpecificity(entry, offeredType) {
  const [type, subtype] = offeredType.split("/");
  if (entry.type === type && entry.subtype === subtype) {
    return 2;
  }
  if (entry.type === type && entry.subtype === "*") {
    return 1;
  }
  if (entry.type === "*" && entry.subtype === "*") {
    return 0;
  }
  return -1;
}

function bestMatch(entries, offeredType) {
  return entries.reduce((best, entry) => {
    const specificity = matchSpecificity(entry, offeredType);
    if (specificity < 0 || (best && (specificity < best.specificity || (specificity === best.specificity && entry.index >= best.entry.index)))) {
      return best;
    }
    return { entry, specificity };
  }, null);
}

export function preferredRepresentation(accept) {
  if (accept === null) {
    return HTML;
  }

  const entries = parseAccept(accept);
  const choices = [HTML, MARKDOWN]
    .map((type) => {
      const match = bestMatch(entries, type);
      return match ? { type, quality: match.entry.quality, index: match.entry.index } : null;
    })
    .filter((choice) => choice && choice.quality > 0);

  if (choices.length === 0) {
    return null;
  }

  choices.sort((left, right) => {
    if (right.quality !== left.quality) {
      return right.quality - left.quality;
    }
    if (left.index !== right.index) {
      return left.index - right.index;
    }
    return left.type === HTML ? -1 : 1;
  });

  return choices[0].type;
}

function mergeVary(headers, fieldName) {
  const existing = headers.get("Vary");
  if (!existing) {
    headers.set("Vary", fieldName);
    return;
  }

  const values = existing.split(",").map((value) => value.trim());
  if (!values.some((value) => value.toLowerCase() === fieldName.toLowerCase())) {
    values.push(fieldName);
  }
  headers.set("Vary", values.join(", "));
}

function responseFromAsset(asset, request, { contentType, status } = {}) {
  const headers = new Headers(asset.headers);
  if (contentType) {
    headers.set("Content-Type", `${contentType}; charset=utf-8`);
  }
  mergeVary(headers, "Accept");
  mergeVary(headers, "Accept-Encoding");

  return new Response(request.method === "HEAD" ? null : asset.body, {
    status: status ?? asset.status,
    statusText: status === 404 ? "Not Found" : asset.statusText,
    headers,
  });
}

function directAssetResponse(asset, request, contentType) {
  const headers = new Headers(asset.headers);
  headers.set("Content-Type", `${contentType}; charset=utf-8`);
  return new Response(request.method === "HEAD" ? null : asset.body, {
    status: asset.status,
    statusText: asset.statusText,
    headers,
  });
}

function textResponse(body, status, request, contentType) {
  const headers = new Headers({ "Content-Type": `${contentType}; charset=utf-8` });
  mergeVary(headers, "Accept");
  return new Response(request.method === "HEAD" ? null : body, { status, headers });
}

function jsonResponse(body, status, request, headers = {}) {
  const responseHeaders = new Headers({
    "Content-Type": `${JSON_MEDIA_TYPE}; charset=utf-8`,
    ...headers,
  });
  return new Response(request.method === "HEAD" ? null : JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

function apiError(request, status, code, message, resolution, headers) {
  return jsonResponse({ error: { code, message, resolution } }, status, request, headers);
}

function handleApi(request, url) {
  if (url.pathname !== "/api/site") {
    return apiError(
      request,
      404,
      "not_found",
      "No API resource matches this path.",
      "Fetch /openapi.json to discover supported resources; GET /api/site is the available API resource."
    );
  }

  if (!["GET", "HEAD"].includes(request.method)) {
    return apiError(
      request,
      405,
      "method_not_allowed",
      "This API resource only accepts GET or HEAD requests.",
      "Retry the request with GET, or fetch /openapi.json for the API contract.",
      { Allow: "GET, HEAD" }
    );
  }

  return jsonResponse(SITE_DISCOVERY, 200, request);
}

async function fetchAsset(env, request, path) {
  const assetUrl = new URL(path, request.url);
  return env.ASSETS.fetch(
    new Request(assetUrl, {
      method: request.method,
      headers: request.headers,
    })
  );
}

function notAcceptable(request) {
  return textResponse(
    "406 Not Acceptable\n\nThis resource is available as text/html or, where published, text/markdown.\n",
    406,
    request,
    "text/plain"
  );
}

function isPagePath(pathname) {
  const basename = pathname.split("/").at(-1);
  return pathname.endsWith("/") || !basename.includes(".") || basename.endsWith(".html");
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);

  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    return handleApi(request, url);
  }

  if (url.pathname === "/openapi.json") {
    return directAssetResponse(await env.ASSETS.fetch(request), request, JSON_MEDIA_TYPE);
  }

  if (url.pathname === "/.well-known/api-catalog") {
    return directAssetResponse(await env.ASSETS.fetch(request), request, "application/linkset+json");
  }

  if (!["GET", "HEAD"].includes(request.method)) {
    return env.ASSETS.fetch(request);
  }

  if (!isPagePath(url.pathname)) {
    return env.ASSETS.fetch(request);
  }

  const representation = preferredRepresentation(request.headers.get("Accept"));
  if (!representation) {
    return notAcceptable(request);
  }

  const markdownPath = MARKDOWN_VARIANTS.get(url.pathname);
  if (representation === MARKDOWN && markdownPath) {
    const asset = await fetchAsset(env, request, markdownPath);
    return responseFromAsset(asset, request, { contentType: MARKDOWN });
  }

  const asset = await env.ASSETS.fetch(request);
  if (asset.status !== 404) {
    if (representation === MARKDOWN) {
      return notAcceptable(request);
    }
    return responseFromAsset(asset, request);
  }

  if (representation === MARKDOWN) {
    const notFound = await fetchAsset(env, request, "/agent-content/404.md");
    return responseFromAsset(notFound, request, { contentType: MARKDOWN, status: 404 });
  }

  const notFound = await fetchAsset(env, request, "/404.html");
  return responseFromAsset(notFound, request, { contentType: HTML, status: 404 });
}

export default {
  fetch: handleRequest,
};
