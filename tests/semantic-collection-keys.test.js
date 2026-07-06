// Tests CONGELADOS (oráculo) del contrato semantic-collection-keys — task del A/B v1 vs v2.
// keys() -> array de ids de todos los docs. Autorados por el PM (constante para ambos brazos).

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { SemanticCollection } = require("../src/semantic-collection.js");

test("keys() de colección vacía => []", () => {
  assert.deepEqual(new SemanticCollection({ dim: 3 }).keys(), []);
});

test("keys() devuelve los ids upserted (uno por doc, sin duplicados)", () => {
  const sc = new SemanticCollection({ dim: 3 });
  sc.upsert("a", {}, [1, 0, 0]);
  sc.upsert("b", {}, [0, 1, 0]);
  sc.upsert("a", { v: 2 }, [1, 0, 0]); // re-upsert del mismo id
  const k = sc.keys().sort();
  assert.deepEqual(k, ["a", "b"]);
});

test("keys() refleja los deletes", () => {
  const sc = new SemanticCollection({ dim: 3 });
  sc.upsert("a", {}, [1, 0, 0]);
  sc.upsert("b", {}, [0, 1, 0]);
  sc.delete("a");
  assert.deepEqual(sc.keys(), ["b"]);
});

test("keys() devuelve strings (los _id)", () => {
  const sc = new SemanticCollection({ dim: 3 });
  sc.upsert("x", {}, [1, 0, 0]);
  const k = sc.keys();
  assert.equal(k.length, 1);
  assert.equal(typeof k[0], "string");
  assert.equal(k[0], "x");
});

test("keys() no muta el estado (idempotente en lecturas)", () => {
  const sc = new SemanticCollection({ dim: 3 });
  sc.upsert("a", {}, [1, 0, 0]);
  sc.keys();
  sc.keys();
  assert.equal(sc.count(), 1);
});
