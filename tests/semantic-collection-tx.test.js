// Tests CONGELADOS (oráculo) del contrato semantic-collection-tx (Fase C: transacciones).
// begin/commit/rollback: atomicidad con snapshot en memoria + journaling diferido.
// Autorados por el PM ANTES de delegar; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readOps } = require("../src/wal.js");
const { SemanticCollection } = require("../src/semantic-collection.js");

function paths() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-tx-"));
  return { snap: path.join(dir, "col.json"), wal: path.join(dir, "col.wal") };
}

test("rollback deshace los upserts de la transacción", () => {
  const sc = new SemanticCollection({ dim: 3 });
  sc.begin();
  sc.upsert("a", { n: 1 }, [1, 0, 0]);
  sc.rollback();
  assert.equal(sc.count(), 0);
  assert.equal(sc.get("a"), null);
});

test("commit hace permanentes los cambios", () => {
  const sc = new SemanticCollection({ dim: 3 });
  sc.begin();
  sc.upsert("a", { n: 1 }, [1, 0, 0]);
  sc.commit();
  assert.equal(sc.get("a").n, 1);
});

test("read-your-writes: dentro de la tx las lecturas ven los cambios aplicados", () => {
  const sc = new SemanticCollection({ dim: 3 });
  sc.begin();
  sc.upsert("a", { n: 1 }, [1, 0, 0]);
  assert.equal(sc.get("a").n, 1); // aplicado en memoria durante la tx
  assert.equal(sc.search([1, 0, 0], { limit: 1 })[0].id, "a");
  sc.rollback();
  assert.equal(sc.get("a"), null); // deshecho
});

test("rollback restaura un estado previo mixto (upsert + delete)", () => {
  const sc = new SemanticCollection({ dim: 3 });
  sc.upsert("a", { n: 1 }, [1, 0, 0]);
  sc.upsert("b", { n: 2 }, [0, 1, 0]);
  sc.begin();
  sc.delete("a");
  sc.upsert("c", { n: 3 }, [0, 0, 1]);
  sc.upsert("b", { n: 99 }, [0, 1, 0]);
  sc.rollback();
  assert.equal(sc.count(), 2);
  assert.equal(sc.get("a").n, 1);
  assert.equal(sc.get("b").n, 2); // restaurado, no 99
  assert.equal(sc.get("c"), null);
});

test("tx + WAL: commit anexa las ops; rollback NO", () => {
  const { snap, wal } = paths();
  const sc = SemanticCollection.openDurable({ path: snap, walPath: wal, dim: 3 });

  sc.begin();
  sc.upsert("a", {}, [1, 0, 0]);
  assert.deepEqual(readOps(wal), []); // aún no journaliza (diferido)
  sc.commit();
  assert.deepEqual(readOps(wal).map((o) => o.id), ["a"]); // ahora sí

  sc.begin();
  sc.upsert("b", {}, [0, 1, 0]);
  sc.rollback();
  assert.deepEqual(readOps(wal).map((o) => o.id), ["a"]); // b NO se journaliza
  assert.equal(sc.get("b"), null);
  assert.equal(sc.get("a")._id, "a");
});

test("tx + WAL: tras rollback, openDurable reconstruye sin la op descartada", () => {
  const { snap, wal } = paths();
  const sc = SemanticCollection.openDurable({ path: snap, walPath: wal, dim: 3 });
  sc.begin();
  sc.upsert("a", { n: 1 }, [1, 0, 0]);
  sc.commit();
  sc.begin();
  sc.upsert("z", { n: 9 }, [0, 0, 1]);
  sc.rollback();
  const re = SemanticCollection.openDurable({ path: snap, walPath: wal, dim: 3 });
  assert.equal(re.get("a").n, 1);
  assert.equal(re.get("z"), null);
});

test("begin anidado lanza; commit/rollback sin begin lanzan", () => {
  const sc = new SemanticCollection({ dim: 3 });
  sc.begin();
  assert.throws(() => sc.begin()); // no anidamiento
  sc.commit();
  assert.throws(() => sc.commit()); // sin tx activa
  assert.throws(() => sc.rollback()); // sin tx activa
});

test("sin transacción, upsert sigue funcionando normal (regresión)", () => {
  const sc = new SemanticCollection({ dim: 3 });
  sc.upsert("a", { n: 1 }, [1, 0, 0]);
  assert.equal(sc.get("a").n, 1);
});
