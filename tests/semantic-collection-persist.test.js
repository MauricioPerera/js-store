// Tests CONGELADOS (oráculo) del contrato semantic-collection-persist.
// Round-trip de serialización: serialize() -> objeto plano JSON -> deserialize().
// Autorados por el PM ANTES de delegar; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { SemanticCollection } = require("../src/semantic-collection.js");

function seeded() {
  const sc = new SemanticCollection({ dim: 3, col: "c" });
  sc.upsert("a", { tipo: "post", n: 1 }, [1, 0, 0]);
  sc.upsert("b", { tipo: "note", n: 2 }, [0, 1, 0]);
  sc.upsert("d", { tipo: "post", n: 3 }, [0, 0, 1]);
  return sc;
}

test("round-trip preserva la búsqueda (ranking + doc)", () => {
  const sc = seeded();
  const restored = SemanticCollection.deserialize(sc.serialize());
  const before = sc.search([1, 0, 0], { limit: 3 });
  const after = restored.search([1, 0, 0], { limit: 3 });
  assert.deepEqual(after.map((r) => r.id), before.map((r) => r.id));
  assert.deepEqual(after.map((r) => r.doc.n), before.map((r) => r.doc.n));
});

test("round-trip preserva el filtro documental", () => {
  const restored = SemanticCollection.deserialize(seeded().serialize());
  const res = restored.search([1, 0, 0], { filter: { tipo: "post" }, limit: 5 });
  assert.deepEqual(res.map((r) => r.id), ["a", "d"]);
});

test("serialize() devuelve un objeto plano JSON-serializable (sin binario)", () => {
  const data = seeded().serialize();
  const roundTripped = JSON.parse(JSON.stringify(data));
  assert.deepEqual(roundTripped, data);
});

test("deserialize acepta el objeto tras pasar por JSON.stringify/parse (listo para disco)", () => {
  const wire = JSON.stringify(seeded().serialize());
  const restored = SemanticCollection.deserialize(JSON.parse(wire));
  assert.equal(restored.search([0, 1, 0], { limit: 1 })[0].id, "b");
});

test("serialize() incluye col y dim", () => {
  const data = seeded().serialize();
  assert.equal(data.col, "c");
  assert.equal(data.dim, 3);
});

test("colección vacía: round-trip => búsqueda vacía", () => {
  const empty = new SemanticCollection({ dim: 3 });
  const restored = SemanticCollection.deserialize(empty.serialize());
  assert.deepEqual(restored.search([1, 0, 0]), []);
});

test("la colección restaurada es independiente del original", () => {
  const sc = seeded();
  const restored = SemanticCollection.deserialize(sc.serialize());
  restored.upsert("z", { tipo: "post", n: 9 }, [1, 1, 0]);
  // Mutar la restaurada no afecta al original.
  assert.equal(sc.search([1, 1, 0], { limit: 10 }).some((r) => r.id === "z"), false);
});
