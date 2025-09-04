// api/callback.cjs — Shopify OAuth (with DEBUG for state mismatch)
const crypto = require("crypto");

function parseQuery(reqUrl) {
  const url = new URL(reqUrl || "/api/callback", "https://dummy.host");
  const out = {};
  for (const [k, v] of url.searchParams.entries()) {
    if (out[k]) out[k] = Array.isArray(out[k]) ? [...out[k], v] : [out[k], v];
    else out[k] = v;
  }
  return out;
}

function validHmac(allQuery, secret) {
  const { hmac, signature, ...rest } = allQuery;
  const message = Object.keys(rest).sort()
    .map(k => `${k}=${Array.isArray(rest[k]) ? rest[k].join(",") : rest[k]}`)
    .join("&");
  const digest = crypto.createHmac("sha256", secret).update(message).digest("hex");
  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(hmac || "", "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  try {
    const q = parseQuery(req.url);
    const { shop, code, hmac, state } = q;

    // Direct hits show it's alive
    if (!shop || !code || !hmac || !state) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.end("Missing required query parameters.");
    }

    // DEBUG BLOCK for 'state' (remove after one test)
    if (!process.env.EXPECTED_STATE || state !== process.env.EXPECTED_STATE) {
      res.statusCode = 403;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.end(`Invalid state. got="${state}" expected="${process.env.EXPECTED_STATE || "(unset)"}"`);
    }

    if (!validHmac(q, process.env.SHOPIFY_API_SECRET)) {
      res.statusCode = 403; return res.end("HMAC validation failed.");
    }

    const r = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code,
      }),
    });

    if (!r.ok) {
      const txt = await r.text();
      res.statusCode = 400;
      return res.end("Token exchange failed: " + txt);
    }

    const tokenData = await r.json();
    const token = tokenData.access_token || "";
    const masked = token ? token.slice(0,6) + "…(hidden)…" + token.slice(-4) : "N/A";

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`<h2>Shopify install successful</h2>
             <p><b>Shop:</b> ${shop}</p>
             <p><b>Scopes:</b> ${tokenData.scope || "(not provided)"}</p>
             <p><b>Access Token (masked):</b> ${masked}</p>`);
  } catch (e) {
    console.error("Callback crash:", e);
    res.statusCode
