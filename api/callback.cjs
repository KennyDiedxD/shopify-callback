// api/callback.cjs — Shopify OAuth + save token to Vercel KV (CommonJS)
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

  // Shopify's query hmac is hex; compare safely
  const a = Buffer.from(digest, "hex");
  const b = Buffer.from((hmac || ""), "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  try {
    const q = parseQuery(req.url);
    const { shop, code, hmac, state } = q;

    // Direct-hit sanity check (helps while testing)
    if (!shop || !code || !hmac || !state) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.end("Missing required query parameters.");
    }

    // CSRF protection — DEBUG: show exact mismatch
function toHex(s){ return [...Buffer.from(String(s) || "", "utf8")].map(b=>b.toString(16).padStart(2,"0")).join(" "); }

if (!process.env.EXPECTED_STATE || state !== process.env.EXPECTED_STATE) {
  res.statusCode = 403;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  return res.end(
    `Invalid state. got="${state}" expected="${process.env.EXPECTED_STATE || "(unset)"}"\n` +
    `len.got=${(state||"").length} len.exp=${(process.env.EXPECTED_STATE||"").length}\n` +
    `hex.got=${toHex(state)}\nhex.exp=${toHex(process.env.EXPECTED_STATE)}`
  );
}


    // Authenticity (query HMAC)
    if (!validHmac(q, process.env.SHOPIFY_API_SECRET)) {
      res.statusCode = 403;
      return res.end("HMAC validation failed.");
    }

    // Exchange authorization code for access token
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

    // Save per shop in Vercel KV
    await kv.hset(`shop:${shop}`, {
      token,
      scope: tokenData.scope || "",
      installed_at: Date.now()
    });

    // (Optional) Register uninstall webhook so you can delete the token later
    // Requires write_webhooks scope if you enable it.
    // await fetch(`https://${shop}/admin/api/2024-07/webhooks.json`, {
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "application/json",
    //     "X-Shopify-Access-Token": token
    //   },
    //   body: JSON.stringify({
    //     webhook: {
    //       topic: "app/uninstalled",
    //       address: "https://shopify-callback.vercel.app/api/webhooks-app-uninstalled",
    //       format: "json"
    //     }
    //   })
    // });

    // Show a simple success page (or redirect to your app UI)
    const masked = token ? token.slice(0, 6) + "…(hidden)…" + token.slice(-4) : "N/A";
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(
      `<h2>Shopify install successful</h2>
       <p><b>Shop:</b> ${shop}</p>
       <p><b>Scopes:</b> ${tokenData.scope || "(not provided)"}</p>
       <p><b>Access Token (stored in KV, masked here):</b> ${masked}</p>
       <p style="color:#666">Saved in KV key <code>shop:${shop}</code>. For production, redirect to your app UI.</p>`
    );

    // If you prefer a redirect, replace the last 3 lines with:
    // res.writeHead(302, { Location: `https://${shop}/admin/apps/${process.env.SHOPIFY_API_KEY}` });
    // res.end();
  } catch (e) {
    console.error("Callback crash:", e);
    res.statusCode = 500;
    res.end("Callback error.");
  }
};
