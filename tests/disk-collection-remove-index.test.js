// Tests CONGELADOS (oráculo) del cambio: remove(filter) usa el índice secundario.
// Espejo del fix de count (commit baac444): igualdad simple sobre campo indexado se resuelve por
// índice sin escanear; el resto cae a _scan. White-box sobre _scan/_indexes porque el resultado
// por sí solo no distingue índice de escaneo. Autorizados por el PM; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DiskCollection } = require("../src/disk-collection.js");

function dataPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-dcrmid-"));
  return path.join(dir, "col.data");
}

function idsOf(col, field, value) {
  const m = col._indexes.get(field);
  const s = m && m.get(String(value));
  return s ? [...s].sort() : [];
}

// (a) White-box: con el campo indexado y _scan saboteado (lanza), remove({tipo:"post"}) resuelve
// por índice: devuelve la cantidad correcta, borra del KV (findById null) y deja el índice
// consistente (Set del valor borrado vacío; los otros valores intactos).
test("remove por igualdad simple usa el índice (no escanea): borra los N y deja el índice consistente", () => {
  const col = new DiskCollection(dataPath());
  col.insert({ _id: "a", tipo: "post", n: 1 });
  col.insert({ _id: "b", tipo: "note", n: 2 });
  col.insert({ _id: "c", tipo: "post", n: 3 });
  col.insert({ _id: "d", tipo: "post", n: 4 });
  col.ensureIndex("tipo");

  // Sabotaje: si remove cayera a _scan, esto lanza y rompe el test.
  col._scan = () => { throw new Error("remove no debe escanear con igualdad simple sobre indexado"); };

  const removed = col.remove({ tipo: "post" });
  assert.equal(removed, 3, "devuelve la cantidad correcta (a,c,d)");

  // KV: los borrados desaparecen; el que no matcheaba sigue.
  assert.equal(col.findById("a"), null);
  assert.equal(col.findById("c"), null);
  assert.equal(col.findById("d"), null);
  assert.notEqual(col.findById("b"), null);

  // Índice consistente: "post" quedó vacío; "note" intacto.
  assert.deepEqual(idsOf(col, "tipo", "post"), []);
  assert.deepEqual(idsOf(col, "tipo", "note"), ["b"]);
});

// (c) Filtro sobre valor inexistente del campo indexado -> 0 sin escanear.
test("remove por valor inexistente del indexado devuelve 0 sin escanear", () => {
  const col = new DiskCollection(dataPath());
  col.insert({ _id: "a", tipo: "post" });
  col.insert({ _id: "b", tipo: "note" });
  col.ensureIndex("tipo");

  col._scan = () => { throw new Error("remove({valorInexistente}) no debe escanear"); };
  assert.equal(col.remove({ tipo: "wiki" }), 0);
  // Nada se borró.
  assert.notEqual(col.findById("a"), null);
  assert.notEqual(col.findById("b"), null);
  assert.deepEqual(idsOf(col, "tipo", "post"), ["a"]);
  assert.deepEqual(idsOf(col, "tipo", "note"), ["b"]);
});

// (b) Filtro complejo y filtro sobre campo NO indexado caen a _scan y borran bien.
test("remove con filtro complejo cae a escaneo y borra bien", () => {
  const col = new DiskCollection(dataPath());
  col.insert({ _id: "a", tipo: "post", n: 1 });
  col.insert({ _id: "b", tipo: "post", n: 5 });
  col.insert({ _id: "c", tipo: "note", n: 6 });
  col.ensureIndex("tipo"); // "n" NO está indexado -> $gt cae a escaneo.

  const removed = col.remove({ n: { $gt: 3 } });
  assert.equal(removed, 2, "borra b y c");
  assert.equal(col.findById("b"), null);
  assert.equal(col.findById("c"), null);
  assert.notEqual(col.findById("a"), null);
  // Índice mantenimiento se mantiene coherente con lo borrado.
  assert.deepEqual(idsOf(col, "tipo", "post"), ["a"]);
  assert.deepEqual(idsOf(col, "tipo", "note"), []);
});

test("remove sobre campo NO indexado cae a escaneo y borra bien", () => {
  const col = new DiskCollection(dataPath());
  col.insert({ _id: "a", tipo: "post", autor: "x" });
  col.insert({ _id: "b", tipo: "note", autor: "y" });
  col.ensureIndex("tipo"); // "autor" NO indexado.

  const removed = col.remove({ autor: "y" });
  assert.equal(removed, 1);
  assert.equal(col.findById("b"), null);
  assert.notEqual(col.findById("a"), null);
  assert.deepEqual(idsOf(col, "tipo", "post"), ["a"]);
  assert.deepEqual(idsOf(col, "tipo", "note"), []);
});

// (d) Tras un remove por índice, count y find siguen coherentes: mismos números por índice y,
// forzando el camino de escaneo (vía _indexLookup), por escaneo.
test("tras remove por índice, count y find son coherentes por índice y por escaneo", () => {
  const col = new DiskCollection(dataPath());
  col.insert({ _id: "a", tipo: "post", n: 1 });
  col.insert({ _id: "b", tipo: "note", n: 2 });
  col.insert({ _id: "c", tipo: "post", n: 3 });
  col.insert({ _id: "d", tipo: "post", n: 4 });
  col.ensureIndex("tipo");

  assert.equal(col.remove({ tipo: "post" }), 3); // vía índice

  // Por índice:
  assert.equal(col.count({ tipo: "post" }), 0);
  assert.equal(col.count({ tipo: "note" }), 1);
  assert.deepEqual(col.find({ tipo: "post" }).map((d) => d._id), []);
  assert.deepEqual(col.find({ tipo: "note" }).map((d) => d._id), ["b"]);

  // Forzar camino de escaneo anulando _indexLookup: deben dar los mismos números.
  const orig = col._indexLookup;
  col._indexLookup = () => null;
  assert.equal(col.count({ tipo: "post" }), 0);
  assert.equal(col.count({ tipo: "note" }), 1);
  assert.deepEqual(col.find({ tipo: "post" }).map((d) => d._id), []);
  assert.deepEqual(col.find({ tipo: "note" }).map((d) => d._id), ["b"]);
  col._indexLookup = orig;
});

// (5) Consistencia de retorno: remove devuelve la MISMA cantidad que el escaneo habría devuelto.
// Se compara contra el estado conocido del dataset (3 de 4 docs son "post").
test("remove por índice devuelve la misma cantidad que devolvería el escaneo", () => {
  const col = new DiskCollection(dataPath());
  col.insert({ _id: "a", tipo: "post" });
  col.insert({ _id: "b", tipo: "note" });
  col.insert({ _id: "c", tipo: "post" });
  col.insert({ _id: "d", tipo: "post" });
  col.ensureIndex("tipo");

  // Cantidad esperada por escaneo (sin índice forzado):
  const orig = col._indexLookup;
  col._indexLookup = () => null;
  const porEscaneo = (() => { let n = 0; col._scan({ tipo: "post" }, () => { n++; }); return n; })();
  col._indexLookup = orig;

  assert.equal(porEscaneo, 3);
  assert.equal(col.remove({ tipo: "post" }), porEscaneo);
});