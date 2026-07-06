// Tests CONGELADOS (oráculo) del contrato semantic-collection-upsertmany.
// upsertMany(items): inserción batch sobre upsert. Autorados por el PM; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { SemanticCollection } = require("../src/semantic-collection.js");

test("upsertMany inserta varios y quedan consultables", () => {
  const sc = new SemanticCollection({ dim: 3 });
  sc.upsertMany([
    { id: "a", doc: { tipo: "post" }, vector: [1, 0, 0] },
    { id: "b", doc: { tipo: "note" }, vector: [0, 1, 0] },
    { id: "c", doc: { tipo: "post" }, vector: [0, 0, 1] },
  ]);
  assert.equal(sc.count(), 3);
  assert.equal(sc.get("b").tipo, "note");
  assert.equal(sc.search([1, 0, 0], { limit: 1 })[0].id, "a");
});

test("upsertMany devuelve los ids en orden", () => {
  const sc = new SemanticCollection({ dim: 3 });
  const ids = sc.upsertMany([
    { id: "x", doc: {}, vector: [1, 0, 0] },
    { id: "y", doc: {}, vector: [0, 1, 0] },
  ]);
  assert.deepEqual(ids, ["x", "y"]);
});

test("array vacío => [] y no cambia el estado", () => {
  const sc = new SemanticCollection({ dim: 3 });
  assert.deepEqual(sc.upsertMany([]), []);
  assert.equal(sc.count(), 0);
});

test("id duplicado dentro del batch: gana el último", () => {
  const sc = new SemanticCollection({ dim: 3 });
  sc.upsertMany([
    { id: "a", doc: { v: 1 }, vector: [1, 0, 0] },
    { id: "a", doc: { v: 2 }, vector: [0, 1, 0] },
  ]);
  assert.equal(sc.count(), 1);
  assert.equal(sc.get("a").v, 2);
});

test("upsertMany actualiza ids existentes (idempotente por id)", () => {
  const sc = new SemanticCollection({ dim: 3 });
  sc.upsert("a", { v: 1 }, [1, 0, 0]);
  sc.upsertMany([{ id: "a", doc: { v: 9 }, vector: [1, 0, 0] }]);
  assert.equal(sc.count(), 1);
  assert.equal(sc.get("a").v, 9);
});

test("los documentos insertados por batch llevan su _id", () => {
  const sc = new SemanticCollection({ dim: 3 });
  sc.upsertMany([{ id: "a", doc: { tipo: "post" }, vector: [1, 0, 0] }]);
  assert.equal(sc.get("a")._id, "a");
});
