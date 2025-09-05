const crypto = require("crypto");
const { kv } = require("@vercel/kv");

// Constant-time compare
function safeEqual(a, b) {
  const A = Buffer.from(a || "", "utf8");
  const B = Buffer.from(b || "", "utf8");
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Allow", "POST");
      return res.end("Method Not Allowed");
    }

    // 1) Read raw body
    let raw = "";
    for await (const chunk of req) raw += chunk;

    // 2) Verify HMAC using your app secret
    const secret = process.env.SHOPIFY_API_SECRET || "";
    const expected = crypto.createHmac("sha256", secret).update(raw, "utf8").digest("base64");
    const received = req.headers["x-shopify-hmac-sha256"] || "";
    if (!safeEqual(expected, received)) {
      res.statusCode = 401;
      return res.end("Invalid HMAC");
    }

    // 3) Verify topic + get shop domain
    const topic = (req.headers["x-shopify-topic"] || "").toString();
    const shop  = (req.headers["x-shopify-shop-domain"] || "").toString();

    if (topic !== "app/uninstalled" || !shop) {
      res.statusCode = 400;
      return res.end("Bad webhook");
    }

    // 4) Delete the shop’s token from KV
    await kv.del(`shop:${shop}`);

    // 5) Respond 200
    res.statusCode = 200;
    res.end("ok");
  } catch (e) {
    console.error("uninstalled webhook error:", e);
    res.statusCode = 500;
    res.end("error");
  }
};
