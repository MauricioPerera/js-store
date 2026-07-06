// Tests CONGELADOS (oráculo) del comportamiento de reopen tras un registro TORN al final
// del log (crash mid-append). El constructor debe reconstruir el índice con los registros
// COMPLETOS, descartar el tail torn y truncar el archivo para que quede sano. Autorizados
// por el PM; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DiskKV } = require("../src/disk-kv.js");

function dataPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-diskkv-torn-"));
  return path.join(dir, "kv.data");
}

// Header de 4 bytes BE con N (sin payload).
function header(N) {
  const h = Buffer.alloc(4);
  h.writeUInt32BE(N, 0);
  return h;
}

// REPRO exacto del hallazgo: un SIGKILL a mitad de _appendRecord deja un header sin
// payload al final del log. Al reabrir NO lanza y ve las claves previas.
test("REPRO hallazgo: header sin payload al final => reopen NO lanza, ve claves previas", () => {
  const p = dataPath();
  const kv = new DiskKV(p);
  kv.put("a", { n: 1 });
  kv.put("b", { n: 2 });
  // simula crash mid-append: escribe SOLO el header (4 bytes) sin el payload
  const fd = fs.openSync(p, "r+");
  fs.writeSync(fd, header(50), 0, 4, fs.fstatSync(fd).size);
  fs.closeSync(fd);
  // reopen NO lanza
  const kv2 = new DiskKV(p);
  assert.deepEqual(kv2.get("a"), { n: 1 });
  assert.deepEqual(kv2.get("b"), { n: 2 });
  assert.deepEqual(kv2.keys().sort(), ["a", "b"]);
});

// Torn con payload PARCIAL: el header dice N=50 pero solo hay 20 bytes de payload.
test("torn con payload parcial (N=50, hay 20 bytes) => reopen NO lanza", () => {
  const p = dataPath();
  const kv = new DiskKV(p);
  kv.put("a", { n: 1 });
  // header dice 50, pero el payload truncado tiene solo 20 bytes
  const fd = fs.openSync(p, "r+");
  const size = fs.fstatSync(fd).size;
  fs.writeSync(fd, header(50), 0, 4, size);
  fs.writeSync(fd, Buffer.alloc(20, 0x41), 0, 20, size + 4);
  fs.closeSync(fd);
  const kv2 = new DiskKV(p);
  assert.deepEqual(kv2.get("a"), { n: 1 });
  assert.deepEqual(kv2.keys().sort(), ["a"]);
});

// Tras reabrir un log con tail torn, un put() nuevo es durable y un re-reopen lo ve,
// y el log queda sano (sin bytes torn stranded en el medio).
test("tras reopen torn: put nuevo durable y re-reopen lo ve (log sano, sin stranded)", () => {
  const p = dataPath();
  const kv = new DiskKV(p);
  kv.put("a", { n: 1 });
  kv.put("b", { n: 2 });
  // tail torn: header sin payload
  const fd = fs.openSync(p, "r+");
  fs.writeSync(fd, header(50), 0, 4, fs.fstatSync(fd).size);
  fs.closeSync(fd);
  // reopen (trunca el tail torn) + put nuevo + re-reopen
  const kv2 = new DiskKV(p);
  kv2.put("z", { n: 3 });
  const kv3 = new DiskKV(p);
  assert.deepEqual(kv3.get("a"), { n: 1 });
  assert.deepEqual(kv3.get("b"), { n: 2 });
  assert.deepEqual(kv3.get("z"), { n: 3 });
  assert.deepEqual(kv3.keys().sort(), ["a", "b", "z"]);
  // sanity: el tamaño del log es la suma exacta de los 3 registros completos (sin basura)
  let exp = 0;
  for (const k of ["a", "b", "z"]) {
    const rec = JSON.stringify({ key: k, value: kv3.get(k) });
    exp += 4 + Buffer.byteLength(rec, "utf8");
  }
  assert.equal(fs.statSync(p).size, exp);
});

// Sin regresión: un log SANO reabre idéntico (mismas keys, mismo get).
test("log SANO reabre identico (sin regresion)", () => {
  const p = dataPath();
  const kv = new DiskKV(p);
  kv.put("a", { n: 1 });
  kv.put("b", { n: 2 });
  kv.put("a", { v: 9 });
  kv.delete("b");
  const sizeBefore = fs.statSync(p).size;
  const kv2 = new DiskKV(p);
  assert.deepEqual(kv2.get("a"), { v: 9 });
  assert.equal(kv2.get("b"), null);
  assert.deepEqual(kv2.keys().sort(), ["a"]);
  // sin torn => NO trunca: el tamaño del archivo es idéntico
  assert.equal(fs.statSync(p).size, sizeBefore);
});

// Deseable: dos torn consecutivos simulados al final => solo se pierde lo torn, lo
// completo sobrevive. (append-only real solo puede tornar el último, pero el barrido
// corta en el primer incompleto y tolera cualquier cantidad de bytes torn residuales.)
test("dos torn consecutivos simulados => solo se pierde lo torn, lo completo sobrevive", () => {
  const p = dataPath();
  const kv = new DiskKV(p);
  kv.put("a", { n: 1 });
  kv.put("b", { n: 2 });
  // dos "headers" consecutivos sin payload (8 bytes de basura al final)
  const fd = fs.openSync(p, "r+");
  const size = fs.fstatSync(fd).size;
  fs.writeSync(fd, header(50), 0, 4, size);
  fs.writeSync(fd, header(99), 0, 4, size + 4);
  fs.closeSync(fd);
  const kv2 = new DiskKV(p);
  assert.deepEqual(kv2.get("a"), { n: 1 });
  assert.deepEqual(kv2.get("b"), { n: 2 });
  assert.deepEqual(kv2.keys().sort(), ["a", "b"]);
});