const { test } = require("node:test");
const assert = require("node:assert/strict");
const { manhattan } = require("../src/metric-manhattan.js");
test("manhattan([1,2],[4,6]) = 7", () => assert.equal(manhattan([1, 2], [4, 6]), 7));
test("manhattan([],[]) = 0", () => assert.equal(manhattan([], []), 0));
test("manhattan([1,1],[1,1]) = 0", () => assert.equal(manhattan([1, 1], [1, 1]), 0));
test("manhattan con negativos: [-1,-1],[1,1] = 4", () => assert.equal(manhattan([-1, -1], [1, 1]), 4));
