const { test } = require("node:test");
const assert = require("node:assert/strict");
const { l2 } = require("../src/metric-l2.js");
test("l2([3,4]) = 5", () => assert.equal(l2([3, 4]), 5));
test("l2([]) = 0", () => assert.equal(l2([]), 0));
test("l2([0,0,0]) = 0", () => assert.equal(l2([0, 0, 0]), 0));
test("l2([1,2,2]) = 3", () => assert.equal(l2([1, 2, 2]), 3));
