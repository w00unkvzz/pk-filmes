// Tiny static server for the demo (node serve.js, no dependencies).
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2"
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  let file = decodeURIComponent(url.pathname);
  if (file === "/") file = "/index.html";
  const target = path.resolve(root, `.${file}`);
  if (!target.startsWith(root + path.sep) && target !== root) {
    res.writeHead(403); res.end("Forbidden"); return;
  }
  fs.stat(target, (error, stat) => {
    if (error || !stat.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 — arquivo não encontrado");
      return;
    }
    res.writeHead(200, {
      "Content-Type": types[path.extname(target).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    fs.createReadStream(target).pipe(res);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`PK Filmes demo: http://127.0.0.1:${port}`);
});
