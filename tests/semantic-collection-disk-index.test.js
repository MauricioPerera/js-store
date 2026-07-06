// Tests CONGELADOS (oráculo) del contrato semantic-collection-disk-index.
// ensureIndex(field) en modo disco delega en DiskCollection.ensureIndex(field): el índice interno
// (this._diskDoc._indexes) queda poblado y count({tipo:...}) devuelve lo correcto. No-op en memoria.
// White-box sobre _diskDoc._indexes porque count() escanea y no distingue índice de escaneo.
// Autorados por el PM; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { SemanticCollection } = require("../src/semantic-collection.js");

function base() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-scidx-"));
  return path.join(dir, "col");
}

// ids que el índice interno del DiskCollection guarda para (field, value).
function idsInIndex(sc, field, value) {
  const m = sc._diskDoc._indexes.get(field);
  return m && m.get(String(value)) ? [...m.get(String(value))].sort() : [];
}

test("ensureIndex en modo disco delega y pobla el índice interno del DiskCollection", () => {
  const sc = new SemanticCollection({ path: base(), dim: 3 });
  sc.upsert("a", { tipo: "post" }, [1, 0, 0]);
  sc.upsert("b", { tipo: "note" }, [0, 1, 0]);
  sc.upsert("c", { tipo: "post" }, [0, 0, 1]);

  sc.ensureIndex("tipo");

  assert.deepEqual(idsInIndex(sc, "tipo", "post"), ["a", "c"]);
  assert.deepEqual(idsInIndex(sc, "tipo", "note"), ["b"]);
});

test("count por campo indexado devuelve lo correcto", () => {
  const sc = new SemanticCollection({ path: base(), dim: 3 });
  sc.upsert("a", { tipo: "post" }, [1, 0, 0]);
  sc.upsert("b", { tipo: "note" }, [0, 1, 0]);
  sc.upsert("c", { tipo: "post" }, [0, 0, 1]);
  sc.ensureIndex("tipo");

  assert.equal(sc.count({ tipo: "post" }), 2);
  assert.equal(sc.count({ tipo: "note" }), 1);
  assert.equal(sc.count({ tipo: "otro" }), 0);
});

test("upserts posteriores a ensureIndex quedan cubiertos por el índice", () => {
  const sc = new SemanticCollection({ path: base(), dim: 3 });
  sc.upsert("a", { tipo: "post" }, [1, 0, 0]);
  sc.ensureIndex("tipo");

  // upsert nuevo (posterior al ensureIndex): el adaptador (remove+insert) mantiene _indexes.
  sc.upsert("b", { tipo: "post" }, [0, 1, 0]);
  sc.upsert("c", { tipo: "note" }, [0, 0, 1]);

  assert.deepEqual(idsInIndex(sc, "tipo", "post"), ["a", "b"]);
  assert.deepEqual(idsInIndex(sc, "tipo", "note"), ["c"]);
  assert.equal(sc.count({ tipo: "post" }), 2);
  assert.equal(sc.count({ tipo: "note" }), 1);
});

test("delete posterior retira el id del índice", () => {
  const sc = new SemanticCollection({ path: base(), dim: 3 });
  sc.upsert("a", { tipo: "post" }, [1, 0, 0]);
  sc.upsert("b", { tipo: "post" }, [0, 1, 0]);
  sc.ensureIndex("tipo");

  sc.delete("a");

  assert.deepEqual(idsInIndex(sc, "tipo", "post"), ["b"]);
  assert.equal(sc.count({ tipo: "post" }), 1);
});

test("ensureIndex es idempotente (reconstruye sin duplicar ni perder)", () => {
  const sc = new SemanticCollection({ path: base(), dim: 3 });
  sc.upsert("a", { tipo: "post" }, [1, 0, 0]);
  sc.upsert("b", { tipo: "post" }, [0, 1, 0]);
  sc.ensureIndex("tipo");
  sc.ensureIndex("tipo"); // reconstruye

  assert.deepEqual(idsInIndex(sc, "tipo", "post"), ["a", "b"]);
  assert.equal(sc.count({ tipo: "post" }), 2);
});

test("ensureIndex en modo memoria es no-op (no lanza, no muta)", () => {
  const sc = new SemanticCollection({ dim: 3 });
  sc.upsert("a", { tipo: "post" }, [1, 0, 0]);
  assert.equal(sc._diskDoc, undefined);
  sc.ensureIndex("tipo"); // no-op
  assert.equal(sc.count({ tipo: "post" }), 1);
  assert.equal(sc.count(), 1);
});