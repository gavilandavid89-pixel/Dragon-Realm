const test = require("node:test");
const assert = require("node:assert/strict");
const { isAllowedOrigin } = require("./origin-policy");

test("requests without an Origin header remain usable for same-origin and server clients", () => {
  assert.equal(isAllowedOrigin(undefined, []), true);
  assert.equal(isAllowedOrigin("", []), true);
});

test("only explicitly configured cross-origin clients receive CORS permission", () => {
  assert.equal(isAllowedOrigin("https://game.example", ["https://game.example"]), true);
  assert.equal(isAllowedOrigin("https://attacker.example", ["https://game.example"]), false);
});

test("an empty allowlist does not grant wildcard cross-origin access", () => {
  assert.equal(isAllowedOrigin("https://game.example", []), false);
});
