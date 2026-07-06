// Tests CONGELADOS (oráculo) del contrato disk-vectors (fase 3a).
// Vectores en disco + búsqueda por escaneo streaming. La prueba No-RAM: una instancia NUEVA
// busca sobre lo que escribió otra. Autorados por el PM; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DiskVectorStore } = require("../src/disk-vectors.js");

function dataPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-diskvec-"));
  return path.join(dir, "vec.data");
}

test("set + get: round-trip del vector", () => {
  const vs = new DiskVectorStore(dataPath());
  vs.set("a", [1, 0, 0]);
  assert.deepEqual(vs.get("a"), [1, 0, 0]);
});

test("get de id inexistente => null", () => {
  assert.equal(new DiskVectorStore(dataPath()).get("x"), null);
});

test("search: ranking por similitud coseno (top-k, desc)", () => {
  const vs = new DiskVectorStore(dataPath());
  vs.set("a", [1, 0, 0]);
  vs.set("b", [0.9, 0.1, 0]);
  vs.set("c", [0, 0, 1]);
  const res = vs.search([1, 0, 0], 3);
  assert.deepEqual(res.map((r) => r.id), ["a", "b", "c"]);
  assert.equal(typeof res[0].score, "number");
});

test("search respeta k (límite de resultados)", () => {
  const vs = new DiskVectorStore(dataPath());
  vs.set("a", [1, 0, 0]);
  vs.set("b", [0.9, 0.1, 0]);
  vs.set("c", [0, 0, 1]);
  assert.equal(vs.search([1, 0, 0], 2).length, 2);
});

test("NO-RAM: una instancia NUEVA busca sobre lo que escribió otra (vectores en disco)", () => {
  const p = dataPath();
  const w = new DiskVectorStore(p);
  w.set("a", [1, 0, 0]);
  w.set("b", [0, 1, 0]);
  const r = new DiskVectorStore(p); // no comparte memoria con w
  assert.equal(r.search([1, 0, 0], 1)[0].id, "a");
  assert.deepEqual(r.get("b"), [0, 1, 0]);
});

test("remove: search deja de devolver el vector; persiste", () => {
  const p = dataPath();
  const vs = new DiskVectorStore(p);
  vs.set("a", [1, 0, 0]);
  vs.set("b", [0, 1, 0]);
  vs.remove("a");
  assert.equal(vs.get("a"), null);
  assert.equal(vs.search([1, 0, 0], 5).some((r) => r.id === "a"), false);
  assert.equal(new DiskVectorStore(p).get("a"), null);
});

test("search sobre store vacío => []", () => {
  assert.deepEqual(new DiskVectorStore(dataPath()).search([1, 0, 0], 5), []);
});

test("keys() lista los ids de los vectores (vigentes, sin duplicados)", () => {
  const vs = new DiskVectorStore(dataPath());
  vs.set("a", [1, 0, 0]);
  vs.set("b", [0, 1, 0]);
  vs.set("a", [1, 0, 0]);
  vs.remove("b");
  assert.deepEqual(vs.keys(), ["a"]);
});
