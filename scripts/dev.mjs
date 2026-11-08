import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { localDatabase } from "./local-db.mjs";
import worker from "../server/worker.mjs";

mkdirSync(".local", { recursive: true });
const db = localDatabase(".local/budget.sqlite");
const api = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1:8787");
    if (
      !["127.0.0.1:8787", "127.0.0.1:5173", "localhost:8787"].includes(
        req.headers.host,
      )
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      ...(req.method !== "GET" && req.method !== "HEAD"
        ? { body: req, duplex: "half" }
        : {}),
    });
    const response = await worker.fetch(request, {
      DB: db,
      LOCAL_DEVELOPMENT: "loopback-only",
    });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(500);
    res.end("Błąd lokalnego serwera.");
  }
});
api.listen(8787, "127.0.0.1", () =>
  console.log(
    "Lokalna baza: http://127.0.0.1:8787 (dane wyłącznie na tym Macu)",
  ),
);
const vite = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--configLoader", "native"],
  { stdio: "inherit" },
);
const stop = () => {
  vite.kill();
  api.close();
  db.close();
  process.exit();
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
vite.on("exit", (code) => {
  if (code) {
    api.close();
    db.close();
    process.exit(code);
  }
});
