// Zero-dependency static server that binds to the port assigned in the central
// LocalHost registry (D:/_Claude/LocalHost/registry.json).
//   node serve-local.mjs <registry-key> <fallback-port>
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { extname, join, resolve, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const KEY = process.argv[2];
const FALLBACK = Number(process.argv[3]) || 8081;

function resolvePort() {
  try {
    const reg = JSON.parse(readFileSync(resolve(here, "../../../LocalHost/registry.json"), "utf8"));
    const p = reg.projects.find((x) => x.key === KEY)?.port;
    return typeof p === "number" ? p : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8", ".map": "application/json",
};

const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = normalize(join(here, p));
    if (!file.startsWith(here)) { res.writeHead(403); return res.end("forbidden"); }
    try { if ((await stat(file)).isDirectory()) file = join(file, "index.html"); }
    catch { /* fall through to readFile 404 */ }
    if (p === "/" ) file = join(here, "index.html");
    const data = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  }
});

const PORT = resolvePort();
server.listen(PORT, () => console.log(`${KEY} static site → http://localhost:${PORT}`));
