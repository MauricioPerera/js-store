// Tests CONGELADOS (oráculo) del contrato disk-kv-refresh.
// refresh() permite que un lector vea lo que un escritor anexó (1 escritor + N lectores).
// Autorados por el PM; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DiskKV } = require("../src/disk-kv.js");

function dataPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-refresh-"));
  return path.join(dir, "kv.data");
}

test("un lector NO ve el put del escritor hasta refresh", () => {
  const p = dataPath();
  const w = new DiskKV(p);
  const r = new DiskKV(p); // lector abierto ahora (vacío)
  w.put("a", { n: 1 }); // el escritor anexa
  assert.equal(r.get("a"), null); // el lector aún no lo ve
  r.refresh();
  assert.deepEqual(r.get("a"), { n: 1 }); // ahora sí
});

test("refresh trae varios registros anexados, en orden", () => {
  const p = dataPath();
  const w = new DiskKV(p);
  const r = new DiskKV(p);
  w.put("a", { n: 1 });
  w.put("b", { n: 2 });
  r.refresh();
  assert.deepEqual(r.keys().sort(), ["a", "b"]);
  assert.deepEqual(r.get("b"), { n: 2 });
});

test("refresh ve los deletes del escritor", () => {
  const p = dataPath();
  const w = new DiskKV(p);
  w.put("a", { n: 1 });
  const r = new DiskKV(p);
  assert.deepEqual(r.get("a"), { n: 1 });
  w.delete("a");
  r.refresh();
  assert.equal(r.get("a"), null);
});

test("refresh ve una sobreescritura (última versión)", () => {
  const p = dataPath();
  const w = new DiskKV(p);
  const r = new DiskKV(p);
  w.put("a", { v: 1 });
  w.put("a", { v: 2 });
  r.refresh();
  assert.deepEqual(r.get("a"), { v: 2 });
});

test("refresh sin datos nuevos es idempotente (no rompe)", () => {
  const p = dataPath();
  const w = new DiskKV(p);
  w.put("a", { n: 1 });
  const r = new DiskKV(p);
  r.refresh();
  r.refresh();
  assert.deepEqual(r.get("a"), { n: 1 });
  assert.deepEqual(r.keys(), ["a"]);
});
