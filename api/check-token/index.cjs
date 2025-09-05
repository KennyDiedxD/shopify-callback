const { kv } = require("@vercel/kv");

// Mask tokens by default (use ?full=1 to reveal)
function maskToken(t) {
  if (!t) return t;
  if (t.length <= 10) return "****";
  return t.slice(0, 6) + "…hidden…" + t.slice(-4);
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET");
      return res.end("Method Not Allowed");
    }

    // ---- Simple auth: Authorization: Bearer <secret> OR ?secret=... ----
    const url = new URL(req.url, "https://dummy.host");
    const qsSecret = url.searchParams.get("secret") || "";
    const authz = req.headers["authorization"] || "";
    const bearer = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    const expected = process.env.CHECK_TOKEN_SECRET || process.env.ADMIN_SECRET || "";

    if (!expected || (qsSecret !== expected && bearer !== expected)) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({
        error: "Unauthorized. Provide ?secret=... or Authorization: Bearer ...",
      }));
    }

    // Optional filters
    const shopFilter = url.searchParams.get("shop"); // e.g. ?shop=test-for-pratz.myshopify.com
    const showFull = ["1","true","yes"].includes((url.searchParams.get("full") || "").toLowerCase());

    // List keys
    let keys = [];
    if (shopFilter) {
      keys = [`shop:${shopFilter}`];
    } else {
      keys = await kv.keys("shop:*");
    }

    const out = [];
    for (const key of keys) {
      const data = await kv.hgetall(key);
      if (!data || Object.keys(data).length === 0) continue;

      const shop = key.replace(/^shop:/, "");
      const token = data.token || "";
      out.push({
        shop,
        scope: data.scope || "",
        installed_at: Number(data.installed_at) || null,
        token: showFull ? token : maskToken(token),
      });
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ count: out.length, shops: out }, null, 2));
  } catch (e) {
    console.error("check-token error:", e);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Internal error");
  }
};
