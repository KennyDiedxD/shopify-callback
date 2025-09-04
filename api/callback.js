// api/callback.js
import crypto from "crypto";

function parseQuery(reqUrl) {
  const url = new URL(reqUrl, "https://dummy.host"); // dummy base is required
  const out = {};
  for (const [k, v] of url.searchParams.entries()) {
    if (out[k]) out[k] = Array.isArray(out[k]) ? [...out[k], v] : [out[k], v];
    else out[k] = v;
  }
  return out;
}

function validHmac(allQuery, secret) {
  const { hmac, signature, ...rest } = allQuery;
  const message = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${Array.isArray(rest[k]) ? rest[k].join(",") : rest[k]}`)
    .join("&");
  const digest = crypto.createHmac("sha256", secret).update(message).digest("hex");
  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(hmac || "", "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  try {
    const query = parseQuery(req.url);
    const { shop, code, hmac, state } = query;

    if (!shop || !code || !hmac || !state) {
