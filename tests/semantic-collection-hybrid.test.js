// Tests CONGELADOS (oráculo) del contrato semantic-collection-hybrid.
// searchHybrid fusiona similitud vectorial + relevancia textual (BM25) y aplica
// el filtro documental. Autorados por el PM ANTES de delegar; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { SemanticCollection } = require("../src/semantic-collection.js");

function seeded() {
  const sc = new SemanticCollection({ dim: 3 });
  sc.upsert("a", { text: "alpha", tipo: "post" }, [1, 0, 0]);
  sc.upsert("b", { text: "beta", tipo: "note" }, [0, 1, 0]);
  sc.upsert("c", { text: "gamma", tipo: "post" }, [0, 0, 1]);
  return sc;
}

test("peso solo-texto (vectorWeight 0): domina la relevancia BM25", () => {
  const sc = seeded();
  const res = sc.searchHybrid([1, 0, 0], "beta", {
    mode: "weighted",
    vectorWeight: 0,
    textWeight: 1,
    limit: 1,
  });
  // "beta" solo matchea b, aunque su vector sea disímil de [1,0,0].
  assert.equal(res[0].id, "b");
});

test("peso solo-vector (textWeight 0): domina la similitud vectorial", () => {
  const sc = seeded();
  const res = sc.searchHybrid([0, 0, 1], "beta", {
    mode: "weighted",
    vectorWeight: 1,
    textWeight: 0,
    limit: 1,
  });
  assert.equal(res[0].id, "c");
});

test("el filtro documental sigue aplicando en híbrido", () => {
  const sc = new SemanticCollection({ dim: 3 });
  sc.upsert("a", { text: "beta", tipo: "post" }, [1, 0, 0]);
  sc.upsert("b", { text: "beta", tipo: "note" }, [0, 1, 0]);
  const res = sc.searchHybrid([1, 0, 0], "beta", {
    filter: { tipo: "post" },
    mode: "weighted",
    vectorWeight: 0,
    textWeight: 1,
    limit: 5,
  });
  assert.deepEqual(res.map((r) => r.id), ["a"]);
});

test("textField configurable (indexa otro campo)", () => {
  const sc = new SemanticCollection({ dim: 3 });
  sc.upsert("x", { body: "zeta" }, [1, 0, 0]);
  sc.upsert("y", { body: "omega" }, [0, 1, 0]);
  const res = sc.searchHybrid([0, 1, 0], "zeta", {
    textField: "body",
    mode: "weighted",
    vectorWeight: 0,
    textWeight: 1,
    limit: 1,
  });
  assert.equal(res[0].id, "x");
});

test("cada resultado tiene forma { id, score, doc }", () => {
  const res = seeded().searchHybrid([1, 0, 0], "beta", { limit: 3 });
  const r = res[0];
  assert.deepEqual(Object.keys(r).sort(), ["doc", "id", "score"]);
  assert.equal(typeof r.score, "number");
});

test("limit trunca el resultado híbrido", () => {
  const res = seeded().searchHybrid([1, 0, 0], "beta", { limit: 2 });
  assert.equal(res.length, 2);
});

test("modo por defecto (rrf) no lanza y devuelve resultados válidos", () => {
  const res = seeded().searchHybrid([1, 0, 0], "beta", { limit: 3 });
  assert.equal(Array.isArray(res), true);
  assert.equal(res.every((r) => typeof r.id !== "undefined" && r.doc != null), true);
});
