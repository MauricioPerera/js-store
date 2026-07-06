// Tests CONGELADOS (oráculo) de la opción rebuildIndexes de refresh().
// Cubre el caveat real de los índices secundarios en lectores de larga vida:
//   (a) refresh() SIN opción tras escrituras nuevas -> índice stale (comportamiento actual preservado);
//   (b) refresh({ rebuildIndexes: true }) -> count/find por índice ven lo nuevo, probado ADEMÁS
//       con _scan saboteado (demuestra que el índice quedó reconstruido y se usa, sin caer a escaneo);
//   (c) refresh({ rebuildIndexes: true }) sin índices creados -> no lanza, equivale al refresh normal;
//   (d) en modo memoria refresh({ rebuildIndexes: true }) sigue siendo no-op y no lanza;
//   (e) refresh() y refresh(undefined) siguen funcionando igual que antes (índice stale preservado).
// Autorados por el PM; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { SemanticCollection } = require("../src/semantic-collection.js");

function base() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-screfidx-"));
  return path.join(dir, "col");
}

// Escenario común: escritor + lector sobre el mismo path; lector crea el índice y ve a,b.
function setupIndexed(p) {
  const w = new SemanticCollection({ path: p, dim: 3 });
  const r = new SemanticCollection({ path: p, dim: 3 }); // abierto ahora (vacío)
  w.upsert("a", { tipo: "post" }, [1, 0, 0]);
  w.upsert("b", { tipo: "note" }, [0, 1, 0]);
  r.refresh(); // el lector releva la cola y ve a,b
  r.ensureIndex("tipo"); // índice construido sobre el estado actual (a=post, b=note)
  return { w, r };
}

// (a) refresh() SIN opción tras escrituras nuevas del escritor: el índice sigue stale.
test("refresh() sin opción deja el índice secundario stale para registros nuevos", () => {
  const p = base();
  const { w, r } = setupIndexed(p);
  w.upsert("c", { tipo: "post" }, [0, 0, 1]); // el escritor anexa dos "post" nuevos
  w.upsert("d", { tipo: "post" }, [1, 1, 0]);
  r.refresh(); // SIN opción: releva la cola pero NO reconstruye el índice

  // La vista base (escaneo) ve los 4 docs; el índice stale solo conoce a "a" como "post".
  assert.equal(r.count(), 4);
  assert.equal(r.count({ tipo: "post" }), 1); // vía índice stale: solo "a"
  assert.equal(r.find({ tipo: "post" }).length, 1);
});

// (b) refresh({ rebuildIndexes: true }): el índice queda reconstruido y se usa (no cae a escaneo).
test("refresh({ rebuildIndexes: true }) reconstruye el índice y lo deja al día con lo anexado", () => {
  const p = base();
  const { w, r } = setupIndexed(p);
  w.upsert("c", { tipo: "post" }, [0, 0, 1]);
  w.upsert("d", { tipo: "post" }, [1, 1, 0]);
  r.refresh({ rebuildIndexes: true }); // releva la cola Y re-corre ensureIndex

  // El índice reconstruido ve los 3 "post" (a, c, d).
  assert.equal(r.count({ tipo: "post" }), 3);
  assert.equal(r.find({ tipo: "post" }).length, 3);
  assert.equal(r.count({ tipo: "note" }), 1); // b sigue indexado

  // Prueba de que el índice quedó reconstruido Y se usa: saboteo _scan; si la consulta
  // cayera a escaneo lanzaría. Como resuelve por índice, no toca _scan.
  const dc = r._diskDoc;
  const originalScan = dc._scan;
  dc._scan = () => {
    throw new Error("el índice reconstruido no debería caer a escaneo");
  };
  try {
    assert.equal(r.count({ tipo: "post" }), 3);
    assert.equal(r.find({ tipo: "post" }).length, 3);
  } finally {
    dc._scan = originalScan;
  }
});

// (c) refresh({ rebuildIndexes: true }) sin ningún índice creado: no lanza, equivale al refresh normal.
test("refresh({ rebuildIndexes: true }) sin índices creados equivale al refresh normal", () => {
  const p = base();
  const w = new SemanticCollection({ path: p, dim: 3 });
  const r = new SemanticCollection({ path: p, dim: 3 });
  w.upsert("a", { n: 1 }, [1, 0, 0]);
  assert.doesNotThrow(() => r.refresh({ rebuildIndexes: true })); // _indexes vacío -> no-op
  assert.equal(r.get("a").n, 1); // el refresh normal sí relevó la cola
  assert.equal(r.count(), 1);
  assert.equal(r._diskDoc._indexes.size, 0); // no se creó índice alguno
});

// (d) En modo memoria refresh({ rebuildIndexes: true }) sigue siendo no-op y no lanza.
test("refresh({ rebuildIndexes: true }) en modo memoria es no-op y no lanza", () => {
  const sc = new SemanticCollection({ dim: 3 });
  assert.doesNotThrow(() => sc.refresh({ rebuildIndexes: true }));
  assert.equal(sc.count(), 0);
});

// (e) refresh() y refresh(undefined) siguen funcionando igual que antes (índice stale preservado).
test("refresh(undefined) se comporta como refresh() (índice stale preservado)", () => {
  const p = base();
  const { w, r } = setupIndexed(p);
  w.upsert("c", { tipo: "post" }, [0, 0, 1]);
  r.refresh(undefined); // equivalente a refresh()
  assert.equal(r.count(), 3); // escaneo ve a,b,c
  assert.equal(r.count({ tipo: "post" }), 1); // índice stale: solo "a"
});