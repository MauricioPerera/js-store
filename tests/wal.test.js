// Tests CONGELADOS (oráculo) del contrato wal (Fase B: journal append-only).
// Autorados por el PM ANTES de delegar; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { appendOp, readOps } = require("../src/wal.js");

function walPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-wal-"));
  return path.join(dir, "col.wal");
}

test("appendOp + readOps: round-trip de una operación", () => {
  const wal = walPath();
  appendOp(wal, { op: "upsert", id: "a", doc: { n: 1 }, vector: [1, 0, 0] });
  assert.deepEqual(readOps(wal), [
    { op: "upsert", id: "a", doc: { n: 1 }, vector: [1, 0, 0] },
  ]);
});

test("varias appendOp se acumulan en orden", () => {
  const wal = walPath();
  appendOp(wal, { op: "upsert", id: "a" });
  appendOp(wal, { op: "delete", id: "a" });
  appendOp(wal, { op: "upsert", id: "b" });
  assert.deepEqual(readOps(wal).map((o) => [o.op, o.id]), [
    ["upsert", "a"],
    ["delete", "a"],
    ["upsert", "b"],
  ]);
});

test("readOps de un WAL inexistente => []", () => {
  assert.deepEqual(readOps(walPath()), []);
});

test("readOps de un WAL vacío => []", () => {
  const wal = walPath();
  fs.writeFileSync(wal, "", "utf8");
  assert.deepEqual(readOps(wal), []);
});

test("CRASH: una última línea torn (incompleta) se ignora, las previas intactas", () => {
  const wal = walPath();
  appendOp(wal, { op: "upsert", id: "a" });
  appendOp(wal, { op: "upsert", id: "b" });
  // Simula un crash a mitad de un tercer append: línea JSON incompleta, sin newline.
  fs.appendFileSync(wal, '{"op":"upsert","id":"c"', "utf8");
  assert.deepEqual(readOps(wal).map((o) => o.id), ["a", "b"]);
});

test("los valores complejos (vector, doc anidado) sobreviven al round-trip", () => {
  const wal = walPath();
  const op = { op: "upsert", id: "x", doc: { a: { b: [1, 2] } }, vector: [0.1, 0.2, 0.3] };
  appendOp(wal, op);
  assert.deepEqual(readOps(wal)[0], op);
});
