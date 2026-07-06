// Tests CONGELADOS (oráculo) del contrato disk-kv.
// Prueba clave de "NO depende de RAM": una instancia NUEVA lee lo que escribió otra
// (los datos estaban en disco, no en el proceso). Autorados por el PM; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DiskKV } = require("../src/disk-kv.js");

function dataPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-diskkv-"));
  return path.join(dir, "kv.data");
}

test("put + get: round-trip del valor", () => {
  const kv = new DiskKV(dataPath());
  kv.put("a", { n: 1, txt: "hola" });
  assert.deepEqual(kv.get("a"), { n: 1, txt: "hola" });
});

test("get de clave inexistente => null", () => {
  assert.equal(new DiskKV(dataPath()).get("nope"), null);
});

test("put sobreescribe (gana el último)", () => {
  const kv = new DiskKV(dataPath());
  kv.put("a", { v: 1 });
  kv.put("a", { v: 2 });
  assert.deepEqual(kv.get("a"), { v: 2 });
});

test("NO-RAM: una instancia NUEVA sobre el mismo archivo ve los datos (estaban en disco)", () => {
  const p = dataPath();
  const kv1 = new DiskKV(p);
  kv1.put("a", { n: 1 });
  kv1.put("b", { n: 2 });
  // proceso/instancia distinta: NO comparte memoria con kv1
  const kv2 = new DiskKV(p);
  assert.deepEqual(kv2.get("a"), { n: 1 });
  assert.deepEqual(kv2.get("b"), { n: 2 });
});

test("delete: get devuelve null y keys() lo excluye; persiste en disco", () => {
  const p = dataPath();
  const kv = new DiskKV(p);
  kv.put("a", { n: 1 });
  kv.put("b", { n: 2 });
  kv.delete("a");
  assert.equal(kv.get("a"), null);
  assert.deepEqual(kv.keys().sort(), ["b"]);
  // el borrado también persiste: instancia nueva no ve "a"
  assert.equal(new DiskKV(p).get("a"), null);
});

test("keys() lista las claves actuales (sin duplicados)", () => {
  const kv = new DiskKV(dataPath());
  kv.put("a", {});
  kv.put("b", {});
  kv.put("a", { v: 9 });
  assert.deepEqual(kv.keys().sort(), ["a", "b"]);
});

test("valores grandes hacen round-trip (viven en disco)", () => {
  const kv = new DiskKV(dataPath());
  const big = { vec: Array.from({ length: 1000 }, (_, i) => i * 0.5) };
  kv.put("big", big);
  assert.deepEqual(kv.get("big"), big);
});
