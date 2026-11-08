import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import worker from "../server/worker.mjs";
import { localDatabase } from "./local-db.mjs";

mkdirSync(".local", { recursive: true });
const db = localDatabase(process.env.BUDGET_LOCAL_DB || ".local/budget.sqlite");
const root = resolve("dist");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
};
const ASSETS = {
  async fetch(request) {
    if (!["GET", "HEAD"].includes(request.method))
      return new Response("Method not allowed", { status: 405 });
    let path;
    try {
      path = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return new Response("Invalid path", { status: 400 });
    }
    const target = resolve(root, `.${path === "/" ? "/index.html" : path}`);
    if (!target.startsWith(root + sep))
      return new Response("Forbidden", { status: 403 });
    try {
      return new Response(
        request.method === "HEAD" ? null : await readFile(target),
        {
          headers: {
            "Content-Type": mime[extname(target)] || "application/octet-stream",
          },
        },
      );
    } catch {
      return new Response("Not found", { status: 404 });
    }
  },
};
const server = createServer(async (req, res) => {
  if (req.headers.host !== "127.0.0.1:5173") {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    const request = new Request(new URL(req.url, "http://127.0.0.1:5173"), {
      method: req.method,
      headers: req.headers,
      ...(req.method !== "GET" && req.method !== "HEAD"
        ? { body: req, duplex: "half" }
        : {}),
    });
    const response = await worker.fetch(request, {
      DB: db,
      ASSETS,
      LOCAL_DEVELOPMENT: "loopback-only",
    });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(500);
    res.end("Nie udało się otworzyć lokalnego podglądu.");
  }
});
server.listen(5173, "127.0.0.1", () =>
  console.log("Budżet: http://127.0.0.1:5173/ — prywatny zapis lokalny"),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    server.close();
    db.close();
    process.exit(0);
  });
