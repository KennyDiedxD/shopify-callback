// api/callback.js — minimal CJS smoke test (no imports)
module.exports = (req, res) => {
  res.statusCode = 400;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end("Missing required query parameters.");
};

// Pin Node runtime (not Edge)
module.exports.config = { runtime: "nodejs20.x" };
