// Tests CONGELADOS del fix H7: readOps tolera SOLO un torn tail (última línea con contenido).
// Una línea corrupta con ops válidas después es corrupción del medio y debe lanzar.
// Los WAL se escriben con bytes directos para forzar el torn y la corrupción media.
// Autorados por el PM; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { appendOp, readOps } = require("../src/wal.js");

function walPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-wal-corr-"));
  return path.join(dir, "col.wal");
}

test("H7(a): WAL válido con varias ops -> readOps devuelve todas en orden", () => {
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

test("H7(b): TORN TAIL — ops válidas + línea final incompleta (sin \\n) -> devuelve las válidas sin lanzar", () => {
  const wal = walPath();
  appendOp(wal, { op: "upsert", id: "a" });
  appendOp(wal, { op: "upsert", id: "b" });
  // Crash a mitad del tercer append: JSON parcial, sin newline final.
  fs.appendFileSync(wal, '{"op":"upsert","id":"c"', "utf8");
  assert.deepEqual(readOps(wal).map((o) => o.id), ["a", "b"]);
});

test("H7(c): CORRUPCIÓN MEDIA — línea inválida con ops válidas DESPUÉS -> readOps lanza", () => {
  const wal = walPath();
  appendOp(wal, { op: "upsert", id: "a" });
  // Línea corrupta en el medio (JSON inválido completo con newline).
  fs.appendFileSync(wal, '{"op":"upsert","id":"CORRUPT\n', "utf8");
  // Ops válidas posteriores.
  appendOp(wal, { op: "upsert", id: "b" });
  assert.throws(
    () => readOps(wal),
    /WAL corrupto en la línea/
  );
});

test("H7(d): archivo vacío o inexistente -> []", () => {
  const wal = walPath();
  fs.writeFileSync(wal, "", "utf8");
  assert.deepEqual(readOps(wal), []);
  assert.deepEqual(readOps(path.join(path.dirname(wal), "no-existe.wal")), []);
});