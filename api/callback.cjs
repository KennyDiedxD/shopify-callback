const crypto = require("crypto");
const { kv } = require("@vercel/kv");

// Build a canonical query object from the request URL
function parseQuery(reqUrl) {
  const url = new URL(reqUrl || "/api/callback", "https://dummy.host");
  const out = {};
  for (const [k, v] of url.searchParams.entries()) {
    if (out[k]) out[k] = Array.isArray(out[k]) ? [...out[k], v] : [out[k], v];
    else out[k] = v;
  }
  return out;
}

// Verify HMAC from Shopify query params
function validHmac(allQuery, secret) {
  const { hmac, signature, ...rest } = allQuery;
  const message = Object.keys(rest)
    .sort()
    .map(k => `${k}=${Array.isArray(rest[k]) ? rest[k].join(",") : rest[k]}`)
    .join("&");
  const digest = crypto.createHmac("sha256", secret).update(message).digest("hex");
  const a = Buffer.from(digest, "hex");
  const b = Buffer.from((hmac || ""), "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Strict shop validator: <anything>.myshopify.com
function isValidShop(shop) {
  return typeof shop === "string" &&
    /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop);
}

// ensure the Shopify 'timestamp' is fresh (<= 300s)
function isFresh(ts) {
  const now = Math.floor(Date.now() / 1000);
  const t = Number(ts || 0);
  return Number.isFinite(t) && t > 0 && Math.abs(now - t) <= 300;
}

// Read a cookie by name from req.headers.cookie
function getCookie(req, name) {
  const header = req.headers.cookie || "";
  for (const part of header.split(/;\s*/)) {
    const [k, ...rest] = part.split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

module.exports = async (req, res) => {
  try {
    const q = parseQuery(req.url);
    const { shop, code, hmac, state, timestamp } = q;

    // 1) Basic presence
    if (!shop || !code || !hmac || !state) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.end("Missing required query parameters.");
    }

    // 2) Shop sanity
    if (!isValidShop(shop)) {
      res.statusCode = 400;
      return res.end("Invalid shop domain.");
    }

    // 3) Timestamp freshness (mitigate replay)
    if (!isFresh(timestamp)) {
      res.statusCode = 400;
      return res.end("Stale timestamp.");
    }

    // 4) Authenticity (query HMAC) — MUST pass
    if (!validHmac(q, process.env.SHOPIFY_API_SECRET)) {
      res.statusCode = 403;
      return res.end("HMAC validation failed.");
    }

    // 5) STATE check (server-set cookie must match query state)
    const cookieName = `shopify_state_${shop.replace(/\./g, "_")}`;
    const expected = getCookie(req, cookieName);
    if (!expected || state !== expected) {
      res.statusCode = 403;
      return res.end("Invalid state.");
    }

    // One-time: clear cookie (Path must match how it was set)
    res.setHeader("Set-Cookie", `${cookieName}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`);

    // 6) Exchange authorization code for access token
    const r = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code
      })
    });

    if (!r.ok) {
      const txt = await r.text();
      res.statusCode = 400;
      return res.end("Token exchange failed: " + txt);
    }

    const tokenData = await r.json(); // { access_token, scope }
    const token = tokenData.access_token || "";

    // 7) Save per shop in Vercel KV
    await kv.hset(`shop:${shop}`, {
      token,
      scope: tokenData.scope || "",
      installed_at: Date.now()
    });

    // 8) Show success (or redirect to your UI)
    const masked = token ? token.slice(0, 6) + "…(hidden)…" + token.slice(-4) : "N/A";
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(
      `<h2>Shopify install successful</h2>
       <p><b>Shop:</b> ${shop}</p>
       <p><b>Scopes:</b> ${tokenData.scope || "(not provided)"}</p>
       <p><b>Access Token (stored in KV, masked here):</b> ${masked}</p>
       <p style="color:#666">Saved in KV key <code>shop:${shop}</code>. For production, redirect to your app UI.</p>`
    );

    // Alternative redirect:
    // res.writeHead(302, { Location: `https://${shop}/admin/apps/${process.env.SHOPIFY_API_KEY}` });
    // res.end();
  } catch (e) {
    console.error("Callback crash:", e);
    res.statusCode = 500;
    res.end("Callback error.");
  }
};
