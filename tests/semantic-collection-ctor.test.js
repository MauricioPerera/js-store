// Tests CONGELADOS (oráculo) del contrato semantic-collection-ctor.
// Cubren el constructor de CONVENIENCIA (arma cores propios en memoria) y la
// REGRESIÓN del modo inyección. Autorados por el PM ANTES de delegar; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const V = require("../src/vendor/js-vector-store.js");
const D = require("../src/vendor/js-doc-store.js");
const { SemanticCollection } = require("../src/semantic-collection.js");

test("conveniencia: new SemanticCollection({ dim }) arma cores propios y opera", () => {
  const sc = new SemanticCollection({ dim: 3 });
  sc.upsert("a", { tipo: "post" }, [1, 0, 0]);
  sc.upsert("b", { tipo: "note" }, [0, 1, 0]);
  const res = sc.search([1, 0, 0], { limit: 2 });
  assert.equal(res[0].id, "a");
  assert.equal(res[0].doc.tipo, "post");
});

test("conveniencia: el filtro documental sigue operando", () => {
  const sc = new SemanticCollection({ dim: 3 });
  sc.upsert("a", { tipo: "post" }, [1, 0, 0]);
  sc.upsert("b", { tipo: "note" }, [0.9, 0.1, 0]);
  const res = sc.search([1, 0, 0], { filter: { tipo: "post" }, limit: 5 });
  assert.deepEqual(res.map((r) => r.id), ["a"]);
});

test("conveniencia: dos instancias son independientes (no comparten estado)", () => {
  const a = new SemanticCollection({ dim: 3 });
  const b = new SemanticCollection({ dim: 3 });
  a.upsert("x", { n: 1 }, [1, 0, 0]);
  assert.equal(a.search([1, 0, 0]).length, 1);
  assert.equal(b.search([1, 0, 0]).length, 0);
});

test("conveniencia: col por defecto 'default' y col personalizada operan", () => {
  const def = new SemanticCollection({ dim: 3 });
  def.upsert("a", { n: 1 }, [1, 0, 0]);
  assert.equal(def.search([1, 0, 0]).length, 1);

  const custom = new SemanticCollection({ dim: 3, col: "otra" });
  custom.upsert("a", { n: 2 }, [1, 0, 0]);
  assert.equal(custom.search([1, 0, 0])[0].doc.n, 2);
});

test("REGRESIÓN: el modo inyección sigue vigente y tiene prioridad", () => {
  const vectorStore = new V.VectorStore(new V.MemoryStorageAdapter(), 3);
  const docCollection = new D.DocStore(new D.MemoryStorageAdapter()).collection("c");
  const sc = new SemanticCollection({ vectorStore, docCollection, col: "c" });
  sc.upsert("a", { tipo: "post" }, [1, 0, 0]);
  // Debe haber usado las instancias inyectadas, no unas propias.
  assert.equal(vectorStore.search("c", [1, 0, 0], 5)[0].id, "a");
  assert.equal(docCollection.findById("a").tipo, "post");
});
