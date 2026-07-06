// Tests CONGELADOS (oráculo) del contrato ivf-persist.
// save/load del índice IVF: reconstruir NO es necesario tras cargar. Autorados por el PM.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { IVFDiskIndex } = require("../src/ivf-disk.js");

function dataPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-ivfp-"));
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

test("build + save + load en instancia NUEVA => search SIN reconstruir", () => {
  const p = dataPath();
  const ixFile = p + ".ivf";
  const ix = seeded(p);
  ix.build(2, 100);
  ix.save(ixFile);

  const ix2 = new IVFDiskIndex(p); // no comparte memoria; NO llama build()
  assert.equal(ix2.load(ixFile), true);
  assert.equal(ix2.search([1, 0, 0], 1, 2)[0].id, "a");
});

test("round-trip: search tras load == search tras build", () => {
  const p = dataPath();
  const f = p + ".ivf";
  const a = seeded(p);
  a.build(2, 100);
  const before = a.search([1, 0, 0], 4, 2).map((r) => r.id);
  a.save(f);

  const b = new IVFDiskIndex(p);
  b.load(f);
  assert.deepEqual(b.search([1, 0, 0], 4, 2).map((r) => r.id), before);
});

test("load de archivo inexistente => false; search sin índice => []", () => {
  const ix = new IVFDiskIndex(dataPath());
  assert.equal(ix.load(dataPath() + ".nope"), false);
  assert.deepEqual(ix.search([1, 0, 0], 5, 2), []);
});

test("save antes de build lanza", () => {
  const ix = new IVFDiskIndex(dataPath());
  assert.throws(() => ix.save(dataPath() + ".ivf"));
});

test("el archivo del índice es JSON plano (centroids + postings)", () => {
  const p = dataPath();
  const f = p + ".ivf";
  const ix = seeded(p);
  ix.build(2, 100);
  ix.save(f);
  const data = JSON.parse(fs.readFileSync(f, "utf8"));
  assert.ok(Array.isArray(data.centroids));
  assert.ok(Array.isArray(data.postings));
});
