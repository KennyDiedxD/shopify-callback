// api/echo-state.cjs
module.exports = (req, res) => {
  const url = new URL(req.url, "https://dummy.host");
  const state = url.searchParams.get("state") || "";
  const expected = process.env.EXPECTED_STATE || "";

  const toHex = s => [...Buffer.from(s, "utf8")]
    .map(b => b.toString(16).padStart(2, "0"))
    .join(" ");

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({
    state,
    expected,
    match: state === expected,
    len: { state: state.length, expected: expected.length },
    hex: { state: toHex(state), expected: toHex(expected) }
  }));
};
