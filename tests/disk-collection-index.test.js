// Tests CONGELADOS (oráculo) del contrato disk-collection-index.
// Índice secundario: ensureIndex(field) mantiene valor->ids; find lo usa para igualdad simple.
// White-box sobre _indexes porque el resultado por sí solo no distingue índice de escaneo.
// Autorados por el PM; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DiskCollection } = require("../src/disk-collection.js");

function dataPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-dcidx-"));
  return path.join(dir, "col.data");
}

function idsOf(col, field, value) {
  const m = col._indexes.get(field);
  return m && m.get(String(value)) ? [...m.get(String(value))].sort() : [];
}

test("ensureIndex construye el índice sobre los docs existentes", () => {
  const col = new DiskCollection(dataPath());
  col.insert({ _id: "a", tipo: "post" });
  col.insert({ _id: "b", tipo: "note" });
  col.insert({ _id: "c", tipo: "post" });
  col.ensureIndex("tipo");
  assert.deepEqual(idsOf(col, "tipo", "post"), ["a", "c"]);
  assert.deepEqual(idsOf(col, "tipo", "note"), ["b"]);
});

test("find por campo indexado devuelve los docs correctos", () => {
  const col = new DiskCollection(dataPath());
  col.insert({ _id: "a", tipo: "post" });
  col.insert({ _id: "b", tipo: "note" });
  col.ensureIndex("tipo");
  assert.deepEqual(col.find({ tipo: "post" }).map((d) => d._id), ["a"]);
});

test("el índice se mantiene tras insert (nuevo doc indexado)", () => {
  const col = new DiskCollection(dataPath());
  col.insert({ _id: "a", tipo: "post" });
  col.ensureIndex("tipo");
  col.insert({ _id: "b", tipo: "post" });
  assert.deepEqual(idsOf(col, "tipo", "post"), ["a", "b"]);
  assert.deepEqual(col.find({ tipo: "post" }).map((d) => d._id).sort(), ["a", "b"]);
});

test("el índice se mantiene tras remove (id retirado del índice)", () => {
  const col = new DiskCollection(dataPath());
  col.insert({ _id: "a", tipo: "post" });
  col.insert({ _id: "b", tipo: "post" });
  col.ensureIndex("tipo");
  col.remove({ _id: "a" });
  assert.deepEqual(idsOf(col, "tipo", "post"), ["b"]);
  assert.deepEqual(col.find({ tipo: "post" }).map((d) => d._id), ["b"]);
});

test("find con filtro complejo cae a escaneo (sigue correcto)", () => {
  const col = new DiskCollection(dataPath());
  col.insert({ _id: "a", n: 1, tipo: "post" });
  col.insert({ _id: "b", n: 5, tipo: "post" });
  col.ensureIndex("tipo");
  assert.deepEqual(col.find({ n: { $gt: 3 } }).map((d) => d._id), ["b"]);
});

test("find por campo NO indexado sigue funcionando (escaneo)", () => {
  const col = new DiskCollection(dataPath());
  col.insert({ _id: "a", tipo: "post", autor: "x" });
  col.insert({ _id: "b", tipo: "note", autor: "y" });
  col.ensureIndex("tipo");
  assert.deepEqual(col.find({ autor: "y" }).map((d) => d._id), ["b"]);
});
