// api/start-install.cjs (CommonJS on Vercel)
const crypto = require("crypto");

function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function isValidShop(shop) {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop || "");
}

module.exports = (req, res) => {
  const url = new URL(req.url, "https://dummy.host");
  const shop = url.searchParams.get("shop");
  if (!isValidShop(shop)) {
    res.statusCode = 400;
    return res.end("Invalid shop domain");
  }

  // Per-request nonce
  const state = b64url(crypto.randomBytes(24));

  // Short-lived CSRF cookie (HttpOnly)
  res.setHeader("Set-Cookie", [
    `shopify_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`
  ]);

  const scopes = [
    "read_products","read_orders","read_customers","read_fulfillments",
    "read_assigned_fulfillment_orders","read_inventory","read_locations",
    "read_shipping","read_price_rules","read_draft_orders","read_files",
    "read_marketing_events"
  ].join(",");

  const params = new URLSearchParams({
    client_id: "906d690badd771473ef29d1afc3e00e8",
    scope: scopes,
    redirect_uri: "https://shopify-callback.vercel.app/api/callback",
    state
  });

  res.writeHead(302, {
    Location: `https://${shop}/admin/oauth/authorize?${params.toString()}`
  });
  res.end();
};
