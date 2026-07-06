// Tests CONGELADOS (oráculo) del contrato semantic-collection.
// Autorados por el PM ANTES de delegar. El implementador NO los edita.
// Usan los cores vendorizados reales (en memoria) + la API pública SemanticCollection.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const V = require("../src/vendor/js-vector-store.js");
const D = require("../src/vendor/js-doc-store.js");
const { SemanticCollection } = require("../src/semantic-collection.js");

function make() {
  const vectorStore = new V.VectorStore(new V.MemoryStorageAdapter(), 3);
  const docCollection = new D.DocStore(new D.MemoryStorageAdapter()).collection("c");
  return new SemanticCollection({ vectorStore, docCollection, col: "c" });
}

test("search sin filtro: ranking por similitud con doc adjunto", () => {
  const sc = make();
  sc.upsert("a", { tipo: "post" }, [1, 0, 0]);
  sc.upsert("b", { tipo: "note" }, [0.9, 0.1, 0]);
  sc.upsert("d", { tipo: "post" }, [0, 0, 1]);
  const res = sc.search([1, 0, 0], { limit: 3 });
  assert.deepEqual(res.map((r) => r.id), ["a", "b", "d"]);
  assert.equal(typeof res[0].score, "number");
  assert.equal(res[0].doc.tipo, "post");
  assert.equal(res[0].doc._id, "a");
});

test("search con filtro Mongo restringe y preserva orden vectorial", () => {
  const sc = make();
  sc.upsert("a", { tipo: "post" }, [1, 0, 0]);
  sc.upsert("b", { tipo: "note" }, [0.9, 0.1, 0]);
  sc.upsert("d", { tipo: "post" }, [0.8, 0.2, 0]);
  const res = sc.search([1, 0, 0], { filter: { tipo: "post" }, limit: 5 });
  assert.deepEqual(res.map((r) => r.id), ["a", "d"]);
});

test("ANTI-DEGRADACIÓN: over-fetch más allá de limit tras filtrar", () => {
  // Los 2 hits más similares (a,b) quedan fuera del filtro; con limit:1 hay que
  // mirar MÁS ALLÁ de limit en el vector store, o el recall se degrada a 0.
  const sc = make();
  sc.upsert("a", { tipo: "note" }, [1, 0, 0]);
  sc.upsert("b", { tipo: "note" }, [0.9, 0.1, 0]);
  sc.upsert("c", { tipo: "post" }, [0.8, 0.2, 0]);
  sc.upsert("d", { tipo: "post" }, [0.7, 0.3, 0]);
  const res = sc.search([1, 0, 0], { filter: { tipo: "post" }, limit: 1 });
  assert.deepEqual(res.map((r) => r.id), ["c"]);
});

test("limit trunca DESPUÉS de filtrar", () => {
  const sc = make();
  sc.upsert("a", { tipo: "post" }, [1, 0, 0]);
  sc.upsert("b", { tipo: "post" }, [0.9, 0.1, 0]);
  sc.upsert("d", { tipo: "post" }, [0.8, 0.2, 0]);
  const res = sc.search([1, 0, 0], { filter: { tipo: "post" }, limit: 1 });
  assert.deepEqual(res.map((r) => r.id), ["a"]);
});

test("filtro que no matchea nada => []", () => {
  const sc = make();
  sc.upsert("a", { tipo: "post" }, [1, 0, 0]);
  assert.deepEqual(sc.search([1, 0, 0], { filter: { tipo: "zzz" } }), []);
});

test("upsert con id existente ACTUALIZA doc y vector (sin duplicar)", () => {
  const sc = make();
  sc.upsert("a", { tipo: "post", v: 1 }, [1, 0, 0]);
  sc.upsert("a", { tipo: "post", v: 2 }, [0, 1, 0]);
  const res = sc.search([0, 1, 0], { limit: 10 });
  const aHits = res.filter((r) => r.id === "a");
  assert.equal(aHits.length, 1);
  assert.equal(aHits[0].doc.v, 2);
});

test("limit por defecto = 5", () => {
  const sc = make();
  for (let i = 0; i < 7; i++) {
    const vec = [1 - i * 0.1, i * 0.1, 0];
    sc.upsert("id" + i, { tipo: "post" }, vec);
  }
  assert.equal(sc.search([1, 0, 0]).length, 5);
});

test("store vacío => []", () => {
  const sc = make();
  assert.deepEqual(sc.search([1, 0, 0]), []);
});

test("upsert devuelve el id", () => {
  const sc = make();
  assert.equal(sc.upsert("a", { tipo: "post" }, [1, 0, 0]), "a");
});

test("cada resultado tiene forma { id, score, doc }", () => {
  const sc = make();
  sc.upsert("a", { tipo: "post" }, [1, 0, 0]);
  const r = sc.search([1, 0, 0])[0];
  assert.deepEqual(Object.keys(r).sort(), ["doc", "id", "score"]);
});
