// Tests CONGELADOS (oráculo) del contrato semantic-collection-lock (Fase D2).
// Lock de un solo escritor opt-in en openDurable + close(). Autorados por el PM; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { SemanticCollection } = require("../src/semantic-collection.js");

function paths() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-sclock-"));
  return {
    snap: path.join(dir, "col.json"),
    wal: path.join(dir, "col.wal"),
    lock: path.join(dir, "col.lock"),
  };
}

test("openDurable con lockPath adquiere el lock (lockfile con el PID)", () => {
  const { snap, wal, lock } = paths();
  const sc = SemanticCollection.openDurable({ path: snap, walPath: wal, lockPath: lock, dim: 3 });
  try {
    assert.equal(fs.existsSync(lock), true);
    assert.equal(fs.readFileSync(lock, "utf8").trim(), String(process.pid));
  } finally {
    sc.close();
  }
});

test("un segundo openDurable con el lock tomado (vivo) lanza", () => {
  const { snap, wal, lock } = paths();
  const sc = SemanticCollection.openDurable({ path: snap, walPath: wal, lockPath: lock, dim: 3 });
  try {
    assert.throws(() =>
      SemanticCollection.openDurable({ path: snap, walPath: wal, lockPath: lock, dim: 3 })
    );
  } finally {
    sc.close();
  }
});

test("close() libera el lock y permite reabrir", () => {
  const { snap, wal, lock } = paths();
  const sc = SemanticCollection.openDurable({ path: snap, walPath: wal, lockPath: lock, dim: 3 });
  sc.upsert("a", { n: 1 }, [1, 0, 0]);
  sc.close();
  assert.equal(fs.existsSync(lock), false);
  // reabrir tras liberar: no lanza y recupera el estado
  const re = SemanticCollection.openDurable({ path: snap, walPath: wal, lockPath: lock, dim: 3 });
  try {
    assert.equal(re.get("a").n, 1);
  } finally {
    re.close();
  }
});

test("sin lockPath (opt-in): no se crea lock y se puede reabrir sin cerrar (regresión)", () => {
  const { snap, wal, lock } = paths();
  const a = SemanticCollection.openDurable({ path: snap, walPath: wal, dim: 3 });
  a.upsert("a", { n: 1 }, [1, 0, 0]);
  const b = SemanticCollection.openDurable({ path: snap, walPath: wal, dim: 3 }); // sin lock, no lanza
  assert.equal(fs.existsSync(lock), false);
  assert.equal(b.get("a").n, 1);
});

test("close() sin lock activo no lanza", () => {
  const { snap, wal } = paths();
  const sc = SemanticCollection.openDurable({ path: snap, walPath: wal, dim: 3 }); // sin lockPath
  sc.close(); // no debe lanzar
});

test("STALE: openDurable roba un lock de un proceso muerto", () => {
  const { snap, wal, lock } = paths();
  const deadPid = 525252;
  fs.writeFileSync(lock, String(deadPid), "utf8"); // lock huérfano

  const origKill = process.kill;
  process.kill = (pid, sig) => {
    if (pid === deadPid) {
      const e = new Error("no such process");
      e.code = "ESRCH";
      throw e;
    }
    return origKill.call(process, pid, sig);
  };
  try {
    const sc = SemanticCollection.openDurable({ path: snap, walPath: wal, lockPath: lock, dim: 3 });
    assert.equal(fs.readFileSync(lock, "utf8").trim(), String(process.pid)); // robado
    sc.close();
  } finally {
    process.kill = origKill;
  }
});
