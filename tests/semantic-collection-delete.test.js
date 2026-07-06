// Tests CONGELADOS (oráculo) del contrato semantic-collection-delete.
// delete(id) quita de AMBOS stores. Autorados por el PM ANTES de delegar; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { SemanticCollection } = require("../src/semantic-collection.js");

function seeded() {
  const sc = new SemanticCollection({ dim: 3 });
  sc.upsert("a", { tipo: "post" }, [1, 0, 0]);
  sc.upsert("b", { tipo: "note" }, [0, 1, 0]);
  return sc;
}

test("delete quita de ambos stores (doc y vector)", () => {
  const sc = seeded();
  sc.delete("a");
  assert.equal(sc.docCollection.findById("a"), null);
  const ids = sc.search([1, 0, 0], { limit: 10 }).map((r) => r.id);
  assert.equal(ids.includes("a"), false);
});

test("delete devuelve true si el id existía", () => {
  assert.equal(seeded().delete("a"), true);
});

test("delete de id inexistente => false, sin lanzar", () => {
  assert.equal(seeded().delete("zzz"), false);
});

test("delete no afecta a los demás documentos", () => {
  const sc = seeded();
  sc.delete("a");
  const res = sc.search([0, 1, 0], { limit: 10 });
  assert.equal(res.some((r) => r.id === "b"), true);
});

test("tras delete se puede volver a upsert el mismo id (sin estado corrupto)", () => {
  const sc = seeded();
  sc.delete("a");
  sc.upsert("a", { tipo: "post", v: 2 }, [1, 0, 0]);
  const hit = sc.search([1, 0, 0], { limit: 10 }).find((r) => r.id === "a");
  assert.equal(hit.doc.v, 2);
});

test("delete + serialize: el borrado no aparece en el round-trip", () => {
  const sc = seeded();
  sc.delete("a");
  const restored = SemanticCollection.deserialize(sc.serialize());
  assert.equal(restored.docCollection.findById("a"), null);
  assert.equal(restored.search([0, 1, 0])[0].id, "b");
});

test("borrar todo => search vacío", () => {
  const sc = seeded();
  sc.delete("a");
  sc.delete("b");
  assert.deepEqual(sc.search([1, 0, 0]), []);
});
