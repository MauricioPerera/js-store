// Tests CONGELADOS (oráculo) del contrato semantic-collection-find.
// find(filter) delega en this.docCollection.find(filter) y NORMALIZA: SIEMPRE devuelve un array
// de docs (materializa el Cursor del core en modo memoria; en disco ya es array). Misma shape de
// doc que get(id). White-box en disco: sabotea sc._diskDoc._scan para probar que igualdad simple
// sobre campo indexado resuelve por índice (no escanea). Autorizados por el PM; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { SemanticCollection } = require("../src/semantic-collection.js");

function base() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-scfind-"));
  return path.join(dir, "col");
}

// (a) MEMORIA: igualdad, operador $gt y filtro vacío {} devuelven los docs correctos.
// Invariante: sc.find(...) SIEMPRE es un array (materializa el Cursor del core).
test("memoria: find({campo: valor}) devuelve un array con los docs correctos", () => {
  const sc = new SemanticCollection({ dim: 3 });
  sc.upsert("a", { tipo: "post", n: 1 }, [1, 0, 0]);
  sc.upsert("b", { tipo: "note", n: 5 }, [0, 1, 0]);
  sc.upsert("c", { tipo: "post", n: 9 }, [0, 0, 1]);

  const result = sc.find({ tipo: "post" });
  assert.equal(Array.isArray(result), true);
  const posts = result.map((d) => d._id).sort();
  assert.deepEqual(posts, ["a", "c"]);
});

test("memoria: find con operador $gt y find({}) devuelven lo correcto (array)", () => {
  const sc = new SemanticCollection({ dim: 3 });
  sc.upsert("a", { tipo: "post", n: 1 }, [1, 0, 0]);
  sc.upsert("b", { tipo: "note", n: 5 }, [0, 1, 0]);
  sc.upsert("c", { tipo: "post", n: 9 }, [0, 0, 1]);

  const gtResult = sc.find({ n: { $gt: 2 } });
  assert.equal(Array.isArray(gtResult), true);
  const gt = gtResult.map((d) => d._id).sort();
  assert.deepEqual(gt, ["b", "c"]);

  const allResult = sc.find({});
  assert.equal(Array.isArray(allResult), true);
  const all = allResult.map((d) => d._id).sort();
  assert.deepEqual(all, ["a", "b", "c"]);
});

// (d) MEMORIA: shape de cada doc devuelto coincide con get(id) (deepStrictEqual).
test("memoria: cada doc devuelto por find coincide con get(id) (deepStrictEqual)", () => {
  const sc = new SemanticCollection({ dim: 3 });
  sc.upsert("a", { tipo: "post", n: 1 }, [1, 0, 0]);
  sc.upsert("b", { tipo: "note", n: 5 }, [0, 1, 0]);

  const result = sc.find({});
  assert.equal(Array.isArray(result), true);
  for (const doc of result) {
    assert.deepStrictEqual(doc, sc.get(doc._id));
  }
});

// (b) DISCO: igualdad simple sobre campo indexado usa el índice (no escanea).
// White-box: sabotea sc._diskDoc._scan para que lance si se llama.
// Invariante: sc.find(...) SIEMPRE es un array.
test("disco: find({campo: valor}) con campo indexado usa el índice (no escanea)", () => {
  const sc = new SemanticCollection({ path: base(), dim: 3 });
  sc.upsert("a", { tipo: "post", n: 1 }, [1, 0, 0]);
  sc.upsert("b", { tipo: "note", n: 5 }, [0, 1, 0]);
  sc.upsert("c", { tipo: "post", n: 9 }, [0, 0, 1]);
  sc.ensureIndex("tipo");

  sc._diskDoc._scan = () => { throw new Error("find no debería haber escaneado"); };

  const postsResult = sc.find({ tipo: "post" });
  assert.equal(Array.isArray(postsResult), true);
  const posts = postsResult.map((d) => d._id).sort();
  assert.deepEqual(posts, ["a", "c"]);
  const noteResult = sc.find({ tipo: "note" });
  assert.equal(Array.isArray(noteResult), true);
  assert.equal(noteResult.length, 1);
});

// (c) DISCO sin índice: find cae a escaneo y funciona (array).
test("disco sin índice: find cae a escaneo y devuelve lo correcto (array)", () => {
  const sc = new SemanticCollection({ path: base(), dim: 3 });
  sc.upsert("a", { tipo: "post", n: 1 }, [1, 0, 0]);
  sc.upsert("b", { tipo: "note", n: 5 }, [0, 1, 0]);
  sc.upsert("c", { tipo: "post", n: 9 }, [0, 0, 1]);
  // sin ensureIndex -> escaneo

  const postsResult = sc.find({ tipo: "post" });
  assert.equal(Array.isArray(postsResult), true);
  const posts = postsResult.map((d) => d._id).sort();
  assert.deepEqual(posts, ["a", "c"]);
  const gtResult = sc.find({ n: { $gt: 3 } });
  assert.equal(Array.isArray(gtResult), true);
  const gt = gtResult.map((d) => d._id).sort();
  assert.deepEqual(gt, ["b", "c"]);
});

// (d) DISCO: shape de cada doc devuelto coincide con get(id) (deepStrictEqual).
test("disco: cada doc devuelto por find coincide con get(id) (deepStrictEqual)", () => {
  const sc = new SemanticCollection({ path: base(), dim: 3 });
  sc.upsert("a", { tipo: "post", n: 1 }, [1, 0, 0]);
  sc.upsert("b", { tipo: "note", n: 5 }, [0, 1, 0]);

  const result = sc.find({});
  assert.equal(Array.isArray(result), true);
  for (const doc of result) {
    assert.deepStrictEqual(doc, sc.get(doc._id));
  }
});