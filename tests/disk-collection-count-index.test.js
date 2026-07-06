// Tests CONGELADOS (oráculo) de que count(filter) usa el índice secundario.
// White-box: sabotea _scan para probar que NO escanea cuando el filtro es igualdad simple
// sobre un campo indexado; y que SÍ cae a escaneo en el resto de los casos. Autorizados por
// el PM; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DiskCollection } = require("../src/disk-collection.js");

function dataPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-dc-count-idx-"));
  return path.join(dir, "col.data");
}

function seed(col) {
  col.insert({ _id: "a", tipo: "post", n: 1 });
  col.insert({ _id: "b", tipo: "note", n: 5 });
  col.insert({ _id: "c", tipo: "post", n: 9 });
  return col;
}

// (a) count por campo indexado NO escanea: sabotea _scan para que lance si se llama.
test("count({campo: valor}) con campo indexado usa el índice (no escanea)", () => {
  const col = seed(new DiskCollection(dataPath()));
  col.ensureIndex("tipo");
  col._scan = () => { throw new Error("count no debería haber escaneado"); };
  assert.equal(col.count({ tipo: "post" }), 2);
  assert.equal(col.count({ tipo: "note" }), 1);
});

// (b) count con filtro complejo cae a _scan y devuelve lo correcto.
test("count con filtro complejo cae a escaneo y cuenta bien", () => {
  const col = seed(new DiskCollection(dataPath()));
  col.ensureIndex("tipo");
  assert.equal(col.count({ n: { $gt: 3 } }), 2);
  assert.equal(col.count({ tipo: "post", n: 1 }), 1);
});

// (c) count sobre campo NO indexado sigue funcionando vía escaneo.
test("count por campo NO indexado escanea y cuenta bien", () => {
  const col = seed(new DiskCollection(dataPath()));
  col.ensureIndex("tipo");
  assert.equal(col.count({ autor: "x" }), 0);
  col.insert({ _id: "d", tipo: "post", autor: "x" });
  assert.equal(col.count({ autor: "x" }), 1);
});

// (d) coherencia tras insert/remove posteriores a ensureIndex.
test("count refleja insert/remove posteriores a ensureIndex vía índice", () => {
  const col = seed(new DiskCollection(dataPath()));
  col.ensureIndex("tipo");
  assert.equal(col.count({ tipo: "post" }), 2);
  col.insert({ _id: "e", tipo: "post" });
  assert.equal(col.count({ tipo: "post" }), 3);
  col.remove({ _id: "a" });
  assert.equal(col.count({ tipo: "post" }), 2);
  col.remove({ tipo: "post" });
  assert.equal(col.count({ tipo: "post" }), 0);
});

// (5) valor inexistente en campo indexado -> 0 (sin escanear).
test("count de valor inexistente en campo indexado devuelve 0", () => {
  const col = seed(new DiskCollection(dataPath()));
  col.ensureIndex("tipo");
  col._scan = () => { throw new Error("no debería escanear para valor inexistente"); };
  assert.equal(col.count({ tipo: "wiki" }), 0);
});

// (5) batería de coherencia: mismo resultado que tendría escaneando, incluidos
// vacío/undefined (caen a escaneo -> cuentan todo) y valor inexistente no indexado.
test("count coherente con escaneo en toda la batería de filtros", () => {
  const col = seed(new DiskCollection(dataPath()));
  col.ensureIndex("tipo");
  assert.equal(col.count(), 3);
  assert.equal(col.count({}), 3);
  assert.equal(col.count(undefined), 3);
  assert.equal(col.count({ tipo: "post" }), 2);
  assert.equal(col.count({ tipo: "note" }), 1);
  assert.equal(col.count({ n: 5 }), 1);
  assert.equal(col.count({ n: { $gt: 3 } }), 2);
  assert.equal(col.count({ tipo: "wiki" }), 0);
  assert.equal(col.count({ fantasma: 1 }), 0);
});