// Tests CONGELADOS (oráculo) del fast-path de remove({_id: primitivo}) en DiskCollection.
// El fast-path borra por la clave primaria _id en O(1) usando el índice del DiskKV, SIN
// escanear el log. Cubre: (a) NO escanea, (b) correctitud semántica, (c) no rompe
// upsert-replace vía SemanticCollection en disco, (d) otros filtros intactos, (e) índices
// secundarios, (6) complejidad O(N). Autorizados por el PM; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DiskCollection } = require("../src/disk-collection.js");
const { SemanticCollection } = require("../src/semantic-collection.js");

function dataPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-dc-fp-"));
  return path.join(dir, "col.data");
}

function seed(col) {
  col.insert({ _id: "a", tipo: "post", n: 1 });
  col.insert({ _id: "b", tipo: "note", n: 5 });
  col.insert({ _id: "c", tipo: "post", n: 9 });
  return col;
}

// (a) PRUEBA DE QUE NO ESCANEA (white-box, el corazón del fix): sabotea _scan para que
// lance si se llama. remove({_id: existente}) borra sin tocar _scan; remove({_id: no-existe})
// devuelve 0 sin tocar _scan.
test("remove({_id: existente}) no escanea (fast-path por clave primaria)", () => {
  const col = seed(new DiskCollection(dataPath()));
  col._scan = () => { throw new Error("remove({_id}) no debería haber escaneado"); };
  assert.equal(col.remove({ _id: "b" }), 1);
  assert.equal(col.findById("b"), null);
});

test("remove({_id: inexistente}) devuelve 0 sin escanear", () => {
  const col = seed(new DiskCollection(dataPath()));
  assert.equal(col.count(), 3); // verificación previa (lectura, escanea normalmente)
  col._scan = () => { throw new Error("remove({_id inexistente}) no debería escanear"); };
  assert.equal(col.remove({ _id: "no-existe" }), 0); // el fast-path no escanea
  // findById usa el índice del KV (no _scan), así que sigue disponible bajo el sabotage.
  assert.ok(col.findById("a")); // los docs existentes quedan intactos
  assert.equal(col.findById("no-existe"), null);
});

// (b) CORRECTITUD SEMÁNTICA: 3 docs; remove({_id: id2}) => 1, findById(id2)===null, los
// otros intactos, count() coherente. remove({_id: "no-existe"}) => 0, nada cambia.
test("remove({_id: X}) correctitud semántica", () => {
  const col = seed(new DiskCollection(dataPath()));
  assert.equal(col.remove({ _id: "b" }), 1);
  assert.equal(col.findById("b"), null);
  assert.deepEqual(
    col.find({}).map((d) => d._id).sort(),
    ["a", "c"],
  );
  assert.equal(col.count(), 2);
  assert.equal(col.remove({ _id: "no-existe" }), 0);
  assert.equal(col.count(), 2);
  assert.deepEqual(
    col.find({}).map((d) => d._id).sort(),
    ["a", "c"],
  );
});

// (c) NO ROMPE upsert-replace: vía SemanticCollection en disco (tempdir). upsert reemplaza
// sin duplicar; reabrir la colección ve el último valor.
test("upsert-replace vía SemanticCollection disco: count===1, get().n===2, persiste", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-sc-fp-"));
  const base = path.join(dir, "db");
  const dim = 2;
  const v = [0.1, 0.2];
  const sc = new SemanticCollection({ path: base, dim });
  sc.upsert("a", { n: 1 }, v);
  sc.upsert("a", { n: 2 }, v);
  assert.equal(sc.count(), 1);
  assert.equal(sc.get("a").n, 2);
  sc.close();
  // Reabrir sobre el mismo path ve el reemplazo (no duplicado, último valor gana).
  const sc2 = new SemanticCollection({ path: base, dim });
  assert.equal(sc2.count(), 1);
  assert.equal(sc2.get("a").n, 2);
  sc2.close();
});

// (d) OTROS FILTROS INTACTOS: remove por un filtro que NO es {_id: primitivo} sigue
// funcionando (pasa por _scan normalmente y borra los que matchean).
test("remove por filtro NO-_id sigue funcionando vía escaneo", () => {
  const col = seed(new DiskCollection(dataPath()));
  assert.equal(col.remove({ tipo: "post" }), 2);
  assert.equal(col.count(), 1);
  assert.equal(col.findById("b").tipo, "note");
  // Filtro con operador sobre _id: cae a _scan (NO es primitivo).
  const col2 = seed(new DiskCollection(dataPath()));
  assert.equal(col2.remove({ _id: { $ne: "a" } }), 2);
  assert.equal(col2.count(), 1);
  assert.equal(col2.findById("a").n, 1);
});

// (e) ÍNDICES SECUNDARIOS: con ensureIndex("tipo") activo, remove({_id: X}) del fast-path
// también saca X del índice secundario (el fix llama _removeFromIndexes(doc)).
test("remove({_id: X}) fast-path mantiene índice secundario consistente", () => {
  const col = seed(new DiskCollection(dataPath()));
  col.ensureIndex("tipo");
  assert.equal(col.count({ tipo: "post" }), 2);
  assert.equal(col.remove({ _id: "a" }), 1);
  assert.equal(col.count({ tipo: "post" }), 1);
  assert.equal(col.count({ tipo: "note" }), 1);
  // El índice ya no referencia a "a".
  assert.ok(!col._indexes.get("tipo").get("post").has("a"));
});

// (6) COMPLEJIDAD O(N): tras N upserts de ids NUEVOS vía SemanticCollection disco, el total
// de llamadas a _scan del docCollection es 0 (el fast-path nunca escanea). Cuenta llamadas,
// no mide tiempo: robusto y estable.
test("complejidad: N upserts nuevos => 0 llamadas a _scan (O(N), no O(N^2))", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-sc-fp-ON-"));
  const base = path.join(dir, "db");
  const dim = 2;
  const v = [0.1, 0.2];
  const sc = new SemanticCollection({ path: base, dim });
  const dc = sc._diskDoc;
  let scanCalls = 0;
  const origScan = dc._scan.bind(dc);
  dc._scan = (...args) => { scanCalls++; return origScan(...args); };
  const N = 200;
  for (let i = 0; i < N; i++) {
    sc.upsert("id" + i, { n: i }, v);
  }
  assert.equal(scanCalls, 0, "el fast-path de remove({_id}) no debería disparar _scan");
  assert.equal(sc.count(), N);
  sc.close();
});