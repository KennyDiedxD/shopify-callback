// api/callback.cjs — minimal smoke test
module.exports = (req, res) => {
  res.statusCode = 400;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('Missing required query parameters.');
};
