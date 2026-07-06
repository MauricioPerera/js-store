// Tests CONGELADOS (oráculo) del contrato ivf-disk (fase 3b-ii).
// IVF sobre disco: build clusteriza; search lee solo los clusters probados. Autorados por el PM.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { IVFDiskIndex } = require("../src/ivf-disk.js");

function dataPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-ivf-"));
  return path.join(dir, "ivf.data");
}

function seeded(p) {
  const ix = new IVFDiskIndex(p);
  ix.set("a", [1, 0, 0]);
  ix.set("b", [0.95, 0.05, 0]);
  ix.set("c", [0.1, 1, 0]);
  ix.set("d", [0, 0.95, 0.05]);
  return ix;
}

test("nProbe = nClusters (probar todos) => resultado EXACTO por coseno", () => {
  const ix = seeded(dataPath());
  ix.build(2, 100);
  const res = ix.search([1, 0, 0], 4, 2); // probe ambos clusters => exacto
  assert.deepEqual(res.map((r) => r.id), ["a", "b", "c", "d"]);
});

test("search respeta k", () => {
  const ix = seeded(dataPath());
  ix.build(2, 100);
  assert.equal(ix.search([1, 0, 0], 2, 2).length, 2);
});

test("nProbe = 1: solo el cluster más cercano (excluye los lejanos)", () => {
  const ix = seeded(dataPath());
  ix.build(2, 100);
  const ids = ix.search([1, 0, 0], 5, 1).map((r) => r.id);
  // El cluster de [1,0,0] es {a,b}; c y d (eje Y) NO deben aparecer.
  assert.ok(ids.includes("a"));
  assert.ok(!ids.includes("c"));
  assert.ok(!ids.includes("d"));
});

test("NO-RAM: instancia NUEVA reconstruye el índice desde los vectores en disco y busca", () => {
  const p = dataPath();
  seeded(p); // escribe los vectores (persisten en disco)
  const ix2 = new IVFDiskIndex(p); // sin memoria compartida
  ix2.build(2, 100); // reconstruye leyendo del disco
  assert.equal(ix2.search([1, 0, 0], 1, 2)[0].id, "a");
});

test("remove + rebuild: el vector borrado no aparece", () => {
  const ix = seeded(dataPath());
  ix.remove("a");
  ix.build(2, 100);
  const ids = ix.search([1, 0, 0], 5, 2).map((r) => r.id);
  assert.ok(!ids.includes("a"));
});

test("search antes de build (sin índice) => []", () => {
  const ix = new IVFDiskIndex(dataPath());
  ix.set("a", [1, 0, 0]);
  assert.deepEqual(ix.search([1, 0, 0], 5, 2), []);
});

test("índice vacío: build + search => []", () => {
  const ix = new IVFDiskIndex(dataPath());
  ix.build(2, 100);
  assert.deepEqual(ix.search([1, 0, 0], 5, 2), []);
});
