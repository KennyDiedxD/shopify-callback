// api/ping.js
module.exports = (req, res) => {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ ok: true, at: new Date().toISOString() }));
};
module.exports.config = { runtime: "nodejs20.x" };
