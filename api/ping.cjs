// api/ping.cjs
module.exports = (req, res) => {
  res.statusCode = 200;
  res.setHeader("Content-Type","application/json");
  res.end(JSON.stringify({ ok: true, at: new Date().toISOString() }));
};