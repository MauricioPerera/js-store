// Tests CONGELADOS (oráculo) del contrato semantic-collection-durable (Fase B2b).
// openDurable (snapshot + replay WAL) y checkpoint (snapshot atómico + truncar WAL).
// Autorados por el PM ANTES de delegar; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readOps } = require("../src/wal.js");
const { SemanticCollection } = require("../src/semantic-collection.js");

function paths() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-durable-"));
  return { snap: path.join(dir, "col.json"), wal: path.join(dir, "col.wal") };
}

test("recuperación desde WAL puro tras un 'crash' (sin snapshot previo)", () => {
  const { snap, wal } = paths();
  const sc = SemanticCollection.openDurable({ path: snap, walPath: wal, dim: 3 });
  sc.upsert("a", { n: 1 }, [1, 0, 0]);
  sc.upsert("b", { n: 2 }, [0, 1, 0]);
  sc.delete("a");
  // "crash": reabrir desde disco
  const re = SemanticCollection.openDurable({ path: snap, walPath: wal, dim: 3 });
  assert.equal(re.count(), 1);
  assert.equal(re.get("b").n, 2);
  assert.equal(re.get("a"), null);
});

test("openDurable reproduce el WAL pero NO lo re-journaliza (no se duplica)", () => {
  const { snap, wal } = paths();
  const sc = SemanticCollection.openDurable({ path: snap, walPath: wal, dim: 3 });
  sc.upsert("a", {}, [1, 0, 0]);
  sc.upsert("b", {}, [0, 1, 0]);
  const before = readOps(wal).length; // 2
  const re = SemanticCollection.openDurable({ path: snap, walPath: wal, dim: 3 });
  assert.equal(readOps(wal).length, before); // sigue 2, no 4
  assert.equal(re.count(), 2);
});

test("checkpoint escribe el snapshot y trunca el WAL", () => {
  const { snap, wal } = paths();
  const sc = SemanticCollection.openDurable({ path: snap, walPath: wal, dim: 3 });
  sc.upsert("a", { n: 1 }, [1, 0, 0]);
  sc.checkpoint();
  assert.equal(fs.existsSync(snap), true);
  assert.deepEqual(readOps(wal), []);
  const re = SemanticCollection.openDurable({ path: snap, walPath: wal, dim: 3 });
  assert.equal(re.get("a").n, 1);
});

test("snapshot + WAL nuevo tras checkpoint se combinan al reabrir", () => {
  const { snap, wal } = paths();
  const sc = SemanticCollection.openDurable({ path: snap, walPath: wal, dim: 3 });
  sc.upsert("a", { n: 1 }, [1, 0, 0]);
  sc.checkpoint(); // a -> snapshot, WAL vacío
  sc.upsert("b", { n: 2 }, [0, 1, 0]); // b -> WAL
  const re = SemanticCollection.openDurable({ path: snap, walPath: wal, dim: 3 });
  assert.equal(re.count(), 2);
  assert.equal(re.get("a").n, 1);
  assert.equal(re.get("b").n, 2);
});

test("crash entre snapshot y truncado: replay idempotente, sin corromper", () => {
  const { snap, wal } = paths();
  const sc = SemanticCollection.openDurable({ path: snap, walPath: wal, dim: 3 });
  sc.upsert("a", { n: 1 }, [1, 0, 0]);
  // Simula checkpoint a medias: snapshot escrito, WAL NO truncado.
  sc.saveToFile(snap);
  const re = SemanticCollection.openDurable({ path: snap, walPath: wal, dim: 3 });
  assert.equal(re.count(), 1); // upsert idempotente por id: no duplica
  assert.equal(re.get("a").n, 1);
});

test("openDurable sin snapshot ni WAL => colección vacía usable", () => {
  const { snap, wal } = paths();
  const sc = SemanticCollection.openDurable({ path: snap, walPath: wal, dim: 3 });
  assert.equal(sc.count(), 0);
  sc.upsert("x", {}, [1, 0, 0]);
  assert.equal(sc.get("x")._id, "x");
});
