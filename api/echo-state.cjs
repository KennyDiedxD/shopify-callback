// api/echo-state.cjs
module.exports = (req, res) => {
  const url = new URL(req.url, "https://dummy.host");
  const state = url.searchParams.get("state") || "";
  const expected = process.env.EXPECTED_STATE || "(unset)";

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ got: state, expected, match: state === expected }));
};


