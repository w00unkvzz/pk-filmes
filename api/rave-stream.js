// Generic HLS proxy for Rave.
//
// Some providers (playspelis, for example) allow the .m3u8 playlist with any
// User-Agent but reject the .ts segments unless the request looks like a real
// browser. Rave uses its own player/User-Agent, so the playlist loads and the
// video never starts. This endpoint fetches the playlist and every segment with
// a browser UA, rewriting all URIs through the same proxy. It works for any
// HLS title added to catalog.json — no per-title rave configuration.
const crypto = require("crypto");

const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const SECRET = process.env.RAVE_PROXY_SECRET || "w00-rave-stream-v1";

function sign(url) {
  return crypto.createHmac("sha256", SECRET).update(String(url)).digest("base64url").slice(0, 32);
}

function validSignature(url, signature) {
  const expected = sign(url);
  const received = String(signature || "");
  if (received.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
  } catch {
    return false;
  }
}

function proxyPath(url) {
  return `/api/rave-stream?u=${encodeURIComponent(url)}&s=${sign(url)}`;
}

function isPrivateHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "[::1]" || host === "::1") return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(host) || /^fe80:/i.test(host)) return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const [a, b] = ipv4.slice(1).map(Number);
  return a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function rewriteUri(uri, base) {
  const value = String(uri || "").trim();
  if (!value || /^(data|blob|skd|urn):/i.test(value)) return uri;
  try {
    return proxyPath(new URL(value, base).href);
  } catch {
    return uri;
  }
}

function rewritePlaylist(text, base) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => {
      if (!line.trim()) return line;
      if (line.trim().startsWith("#")) {
        return line.replace(/URI="([^"]*)"/g, (_, uri) => `URI="${rewriteUri(uri, base)}"`);
      }
      return rewriteUri(line.trim(), base);
    })
    .join("\n");
}

function isHls(url, contentType) {
  return /mpegurl/i.test(String(contentType || "")) || /\.m3u8(?:$|\?)/i.test(String(url || ""));
}

module.exports = async function handler(req, res) {
  try {
    const targetUrl = String(req.query?.u || "").trim();
    const signature = String(req.query?.s || "").trim();
    if (!targetUrl || !validSignature(targetUrl, signature)) {
      res.statusCode = 403;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ error: "assinatura inválida" }));
      return;
    }

    let target;
    try {
      target = new URL(targetUrl);
    } catch {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "url inválida" }));
      return;
    }

    if (!/^https?:$/.test(target.protocol) || isPrivateHost(target.hostname)) {
      res.statusCode = 403;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ error: "destino não permitido" }));
      return;
    }

    const headers = {
      "user-agent": UA,
      "accept": "*/*",
      "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
      "cache-control": "no-cache",
      "pragma": "no-cache",
      "referer": `${target.origin}/`
    };
    if (req.headers?.range) headers.range = req.headers.range;

    const upstream = await fetch(target.href, {
      headers,
      redirect: "follow",
      cache: "no-store"
    });
    const finalUrl = upstream.url || target.href;
    const contentType = upstream.headers.get("content-type") || "";

    if (!upstream.ok) {
      const body = await upstream.text().catch(() => "");
      res.statusCode = upstream.status;
      res.setHeader("Content-Type", contentType || "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(body || `upstream HTTP ${upstream.status}`);
      return;
    }

    if (isHls(finalUrl, contentType)) {
      const playlist = await upstream.text();
      const rewritten = rewritePlaylist(playlist, finalUrl);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "no-store, max-age=0");
      res.setHeader("Access-Control-Allow-Origin", "*");
      if (req.method === "HEAD") res.end();
      else res.end(rewritten);
      return;
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.statusCode = upstream.status;
    res.setHeader("Content-Type", contentType || "application/octet-stream");
    res.setHeader("Content-Length", String(buffer.length));
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Access-Control-Allow-Origin", "*");
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) res.setHeader("Content-Range", contentRange);
    const acceptRanges = upstream.headers.get("accept-ranges");
    if (acceptRanges) res.setHeader("Accept-Ranges", acceptRanges);
    if (req.method === "HEAD") res.end();
    else res.end(buffer);
  } catch (error) {
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ error: "falha ao buscar stream", detail: error.message || "erro" }));
  }
};
