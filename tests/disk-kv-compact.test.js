// Tests CONGELADOS (oráculo) del contrato disk-kv-compact.
// compact() reescribe el log solo con los registros vivos: el tamaño baja, los datos se
// preservan y persisten. Autorados por el PM; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DiskKV } = require("../src/disk-kv.js");

function dataPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-compact-"));
  return path.join(dir, "kv.data");
}

test("compact preserva los valores vivos", () => {
  const kv = new DiskKV(dataPath());
  kv.put("a", { n: 1 });
  kv.put("b", { n: 2 });
  kv.put("a", { n: 9 }); // supera la versión anterior
  kv.delete("b"); // tombstone
  kv.compact();
  assert.deepEqual(kv.get("a"), { n: 9 });
  assert.equal(kv.get("b"), null);
  assert.deepEqual(kv.keys(), ["a"]);
});

test("compact REDUCE el tamaño del archivo (dropea versiones viejas y tombstones)", () => {
  const p = dataPath();
  const kv = new DiskKV(p);
  const big = { blob: "x".repeat(2000) };
  kv.put("a", big);
  kv.put("a", big); // versión superada
  kv.put("a", big); // otra
  kv.put("b", big);
  kv.delete("b"); // tombstone
  const before = fs.statSync(p).size;
  kv.compact();
  const after = fs.statSync(p).size;
  assert.ok(after < before, `esperaba after (${after}) < before (${before})`);
});

test("compact persiste: una instancia NUEVA ve el estado compactado", () => {
  const p = dataPath();
  const kv = new DiskKV(p);
  kv.put("a", { n: 1 });
  kv.put("a", { n: 2 });
  kv.delete("a");
  kv.put("c", { n: 3 });
  kv.compact();
  const kv2 = new DiskKV(p);
  assert.equal(kv2.get("a"), null);
  assert.deepEqual(kv2.get("c"), { n: 3 });
  assert.deepEqual(kv2.keys(), ["c"]);
});

test("compact sigue permitiendo put/get después (índice reconstruido)", () => {
  const kv = new DiskKV(dataPath());
  kv.put("a", { n: 1 });
  kv.compact();
  kv.put("b", { n: 2 });
  assert.deepEqual(kv.get("a"), { n: 1 });
  assert.deepEqual(kv.get("b"), { n: 2 });
});

test("compact de un store vacío no rompe (get => null, keys => [])", () => {
  const kv = new DiskKV(dataPath());
  kv.compact();
  assert.deepEqual(kv.keys(), []);
  assert.equal(kv.get("x"), null);
});
