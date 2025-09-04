// api/callback.js  — minimal smoke test
module.exports = (req, res) => {
  res.statusCode = 400;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end("Missing required query parameters.");
};
// Force Node runtime so 'require' etc. are allowed when we add them back
module.exports.config = { runtime: "nodejs20.x" };
