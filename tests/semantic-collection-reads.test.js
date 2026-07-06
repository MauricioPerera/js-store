// Tests CONGELADOS (oráculo) del contrato semantic-collection-reads.
// get(id) y count(filter): lecturas directas del CRUD.
// Autorados por el PM ANTES de delegar; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { SemanticCollection } = require("../src/semantic-collection.js");

function seeded() {
  const sc = new SemanticCollection({ dim: 3 });
  sc.upsert("a", { tipo: "post", n: 1 }, [1, 0, 0]);
  sc.upsert("b", { tipo: "note", n: 2 }, [0, 1, 0]);
  sc.upsert("c", { tipo: "post", n: 3 }, [0, 0, 1]);
  return sc;
}

test("get devuelve el documento por id (con _id)", () => {
  const doc = seeded().get("a");
  assert.equal(doc.tipo, "post");
  assert.equal(doc.n, 1);
  assert.equal(doc._id, "a");
});

test("get de id inexistente => null", () => {
  assert.equal(seeded().get("zzz"), null);
});

test("count() sin filtro => total de documentos", () => {
  assert.equal(seeded().count(), 3);
});

test("count(filter) => documentos que matchean el filtro Mongo", () => {
  assert.equal(seeded().count({ tipo: "post" }), 2);
  assert.equal(seeded().count({ tipo: "note" }), 1);
  assert.equal(seeded().count({ tipo: "zzz" }), 0);
});

test("count refleja los borrados", () => {
  const sc = seeded();
  sc.delete("a");
  assert.equal(sc.count(), 2);
  assert.equal(sc.count({ tipo: "post" }), 1);
});

test("get tras delete => null", () => {
  const sc = seeded();
  sc.delete("a");
  assert.equal(sc.get("a"), null);
});

test("count() de colección vacía => 0", () => {
  assert.equal(new SemanticCollection({ dim: 3 }).count(), 0);
});
