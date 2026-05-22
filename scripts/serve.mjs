import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const hostArg = getArgValue(args, "--host");
const portArg = getArgValue(args, "--port");
const host = hostArg || "127.0.0.1";
const port = Number(portArg || 5500);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url || "/", `http://${req.headers.host}`);
  const cleanPath = decodeURIComponent(reqUrl.pathname);
  let relativePath = cleanPath === "/" ? "/index.html" : cleanPath;

  const targetPath = path.resolve(rootDir, `.${relativePath}`);
  if (!targetPath.startsWith(rootDir)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  fs.stat(targetPath, (statErr, stats) => {
    let finalPath = targetPath;

    if (!statErr && stats.isDirectory()) {
      finalPath = path.join(targetPath, "index.html");
    }

    fs.readFile(finalPath, (readErr, data) => {
      if (readErr) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not Found");
        return;
      }

      const ext = path.extname(finalPath).toLowerCase();
      const contentType = mimeTypes[ext] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "no-store"
      });
      res.end(data);
    });
  });
});

server.listen(port, host, () => {
  console.log(`Preview server running at http://${host}:${port}`);
  console.log("Press Ctrl+C to stop.");
});

function getArgValue(argv, key) {
  const idx = argv.indexOf(key);
  if (idx >= 0 && idx + 1 < argv.length) {
    return argv[idx + 1];
  }
  return "";
}
