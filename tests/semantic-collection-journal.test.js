// Tests CONGELADOS (oráculo) del contrato semantic-collection-journal (Fase B2a).
// Journaling opt-in: con walPath, upsert/delete anexan su op al WAL. Sin walPath, nada cambia.
// Autorados por el PM ANTES de delegar; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readOps } = require("../src/wal.js");
const { SemanticCollection } = require("../src/semantic-collection.js");

function walPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-journal-"));
  return path.join(dir, "col.wal");
}

test("con walPath, upsert registra una op 'upsert' en el WAL", () => {
  const wal = walPath();
  const sc = new SemanticCollection({ dim: 3, walPath: wal });
  sc.upsert("a", { n: 1 }, [1, 0, 0]);
  assert.deepEqual(readOps(wal), [
    { op: "upsert", id: "a", doc: { n: 1 }, vector: [1, 0, 0] },
  ]);
});

test("con walPath, delete registra una op 'delete'", () => {
  const wal = walPath();
  const sc = new SemanticCollection({ dim: 3, walPath: wal });
  sc.upsert("a", { n: 1 }, [1, 0, 0]);
  sc.delete("a");
  assert.deepEqual(readOps(wal).map((o) => [o.op, o.id]), [
    ["upsert", "a"],
    ["delete", "a"],
  ]);
});

test("la secuencia de mutaciones se registra en orden", () => {
  const wal = walPath();
  const sc = new SemanticCollection({ dim: 3, walPath: wal });
  sc.upsert("a", {}, [1, 0, 0]);
  sc.upsert("b", {}, [0, 1, 0]);
  sc.delete("a");
  assert.deepEqual(readOps(wal).map((o) => [o.op, o.id]), [
    ["upsert", "a"],
    ["upsert", "b"],
    ["delete", "a"],
  ]);
});

test("upsertMany registra una op por item", () => {
  const wal = walPath();
  const sc = new SemanticCollection({ dim: 3, walPath: wal });
  sc.upsertMany([
    { id: "a", doc: {}, vector: [1, 0, 0] },
    { id: "b", doc: {}, vector: [0, 1, 0] },
  ]);
  assert.deepEqual(readOps(wal).map((o) => o.id), ["a", "b"]);
});

test("sin walPath (default): no se crea WAL ni se journaliza", () => {
  const wal = walPath();
  const sc = new SemanticCollection({ dim: 3 }); // sin walPath
  sc.upsert("a", {}, [1, 0, 0]);
  assert.equal(fs.existsSync(wal), false);
  assert.equal(sc.get("a")._id, "a"); // funciona normal
});

test("las ops del WAL bastan para reconstruir el estado (replay manual)", () => {
  const wal = walPath();
  const sc = new SemanticCollection({ dim: 3, walPath: wal });
  sc.upsert("a", { n: 1 }, [1, 0, 0]);
  sc.upsert("b", { n: 2 }, [0, 1, 0]);
  sc.delete("a");

  const replay = new SemanticCollection({ dim: 3 });
  for (const o of readOps(wal)) {
    if (o.op === "upsert") replay.upsert(o.id, o.doc, o.vector);
    else if (o.op === "delete") replay.delete(o.id);
  }
  assert.equal(replay.count(), 1);
  assert.equal(replay.get("b").n, 2);
  assert.equal(replay.get("a"), null);
});
