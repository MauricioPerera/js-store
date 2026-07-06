// Tests CONGELADOS (oráculo) del contrato semantic-collection-disk-lock.
// { path, lock: true } => un solo escritor (el 2º vivo falla); close() libera. Autorados por el PM.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { SemanticCollection } = require("../src/semantic-collection.js");

function base() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-scdlock-"));
  return path.join(dir, "col");
}

test("lock:true crea el lockfile y opera", () => {
  const p = base();
  const w = new SemanticCollection({ path: p, dim: 3, lock: true });
  try {
    assert.ok(fs.existsSync(p + ".lock"));
    w.upsert("a", { tipo: "post" }, [1, 0, 0]);
    assert.equal(w.get("a").tipo, "post");
  } finally {
    w.close();
  }
});

test("un segundo escritor con lock (vivo) sobre la misma path lanza", () => {
  const p = base();
  const w = new SemanticCollection({ path: p, dim: 3, lock: true });
  try {
    assert.throws(() => new SemanticCollection({ path: p, dim: 3, lock: true }));
  } finally {
    w.close();
  }
});

test("close libera el lock y permite reabrir; los datos persisten", () => {
  const p = base();
  const w = new SemanticCollection({ path: p, dim: 3, lock: true });
  w.upsert("a", { n: 1 }, [1, 0, 0]);
  w.close();
  assert.equal(fs.existsSync(p + ".lock"), false);
  const w2 = new SemanticCollection({ path: p, dim: 3, lock: true });
  try {
    assert.equal(w2.get("a").n, 1);
  } finally {
    w2.close();
  }
});

test("sin lock (default): dos aperturas sobre la misma path conviven (lectores)", () => {
  const p = base();
  const a = new SemanticCollection({ path: p, dim: 3 });
  a.upsert("x", {}, [1, 0, 0]);
  const b = new SemanticCollection({ path: p, dim: 3 }); // sin lock => no lanza
  assert.equal(fs.existsSync(p + ".lock"), false);
  assert.equal(b.get("x")._id, "x");
});

test("close() en una colección sin lock no lanza", () => {
  const sc = new SemanticCollection({ path: base(), dim: 3 });
  sc.close();
});
