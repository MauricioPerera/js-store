// Tests CONGELADOS (oráculo) del contrato disk-collection.
// Colección de documentos sobre DiskKV: docs en disco, queries por escaneo con matchFilter.
// La prueba No-RAM: una instancia NUEVA ve los docs escritos por otra. Autorados por el PM.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DiskCollection } = require("../src/disk-collection.js");

function dataPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-diskcol-"));
  return path.join(dir, "col.data");
}

test("insert + findById: round-trip con _id", () => {
  const col = new DiskCollection(dataPath());
  col.insert({ _id: "a", tipo: "post", n: 1 });
  assert.deepEqual(col.findById("a"), { _id: "a", tipo: "post", n: 1 });
});

test("findById de id inexistente => null", () => {
  assert.equal(new DiskCollection(dataPath()).findById("x"), null);
});

test("NO-RAM: una instancia NUEVA ve los docs escritos por otra (estaban en disco)", () => {
  const p = dataPath();
  const c1 = new DiskCollection(p);
  c1.insert({ _id: "a", tipo: "post" });
  c1.insert({ _id: "b", tipo: "note" });
  const c2 = new DiskCollection(p); // no comparte memoria con c1
  assert.equal(c2.findById("a").tipo, "post");
  assert.equal(c2.findById("b").tipo, "note");
});

test("find con filtro Mongo devuelve los docs que matchean", () => {
  const col = new DiskCollection(dataPath());
  col.insert({ _id: "a", tipo: "post" });
  col.insert({ _id: "b", tipo: "note" });
  col.insert({ _id: "c", tipo: "post" });
  const ids = col.find({ tipo: "post" }).map((d) => d._id).sort();
  assert.deepEqual(ids, ["a", "c"]);
});

test("find({}) devuelve todos", () => {
  const col = new DiskCollection(dataPath());
  col.insert({ _id: "a" });
  col.insert({ _id: "b" });
  assert.equal(col.find({}).length, 2);
});

test("count(filter) cuenta los que matchean", () => {
  const col = new DiskCollection(dataPath());
  col.insert({ _id: "a", tipo: "post" });
  col.insert({ _id: "b", tipo: "note" });
  col.insert({ _id: "c", tipo: "post" });
  assert.equal(col.count(), 3);
  assert.equal(col.count({ tipo: "post" }), 2);
});

test("remove(filter) borra los que matchean y persiste en disco", () => {
  const p = dataPath();
  const col = new DiskCollection(p);
  col.insert({ _id: "a", tipo: "post" });
  col.insert({ _id: "b", tipo: "note" });
  const removed = col.remove({ _id: "a" });
  assert.equal(removed, 1);
  assert.equal(col.findById("a"), null);
  // persiste: instancia nueva tampoco ve "a"
  assert.equal(new DiskCollection(p).findById("a"), null);
});

test("find sobre colección vacía => []", () => {
  assert.deepEqual(new DiskCollection(dataPath()).find({}), []);
});
