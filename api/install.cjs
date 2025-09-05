const crypto = require("crypto");

// Parse `?shop=...`
function parseQuery(reqUrl, host) {
  const url = new URL(reqUrl || "/api/install", `https://${host || "dummy.host"}`);
  const out = {};
  for (const [k, v] of url.searchParams.entries()) out[k] = v;
  return out;
}

// Validate "<something>.myshopify.com"
function isValidShop(shop) {
  return typeof shop === "string" && /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop);
}

module.exports = async (req, res) => {
  try {
    const host = req.headers.host;
    const q = parseQuery(req.url, host);
    const shop = (q.shop || "").trim();

    if (!shop) { res.statusCode = 400; return res.end("Missing ?shop=my-shop.myshopify.com"); }
    if (!isValidShop(shop)) { res.statusCode = 400; return res.end("Invalid shop domain."); }

    // Generate per-request state
    const state = crypto.randomBytes(16).toString("base64url");

    // Set HttpOnly cookie (keyed by shop)
    const cookieName = `shopify_state_${shop.replace(/\./g, "_")}`;
    res.setHeader("Set-Cookie",
      `${cookieName}=${encodeURIComponent(state)}; Max-Age=300; Path=/; HttpOnly; Secure; SameSite=Lax`
    );

    // Redirect to Shopify OAuth with the SAME state
    const params = new URLSearchParams({
      client_id: process.env.SHOPIFY_API_KEY,
      scope: process.env.SHOPIFY_SCOPES,
      redirect_uri: process.env.SHOPIFY_REDIRECT_URI,
      state
    });

    res.writeHead(302, { Location: `https://${shop}/admin/oauth/authorize?${params.toString()}` });
    res.end();
  } catch (e) {
    console.error("Install crash:", e);
    res.statusCode = 500;
    res.end("Install error");
  }
};
