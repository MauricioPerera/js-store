// Tests CONGELADOS (oráculo) del contrato semantic-collection-disk-refresh.
// refresh() en modo disco: un lector de larga vida ve lo que el escritor anexó,
// sin reabrir. Autorados por el PM; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { SemanticCollection } = require("../src/semantic-collection.js");

function base() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-scref-"));
  return path.join(dir, "col");
}

test("un lector de larga vida ve el upsert del escritor tras refresh()", () => {
  const p = base();
  const w = new SemanticCollection({ path: p, dim: 3 });
  const r = new SemanticCollection({ path: p, dim: 3 }); // abierto ahora (vacío)
  w.upsert("a", { tipo: "post" }, [1, 0, 0]);
  assert.equal(r.get("a"), null);   // aún no lo ve
  r.refresh();
  assert.equal(r.get("a").tipo, "post");   // ahora sí (doc)
  const hits = r.search([1, 0, 0], { limit: 5 }); // y el vector
  assert.ok(hits.some((h) => h.id === "a"));
});

test("refresh() trae varios registros y un delete", () => {
  const p = base();
  const w = new SemanticCollection({ path: p, dim: 3 });
  const r = new SemanticCollection({ path: p, dim: 3 });
  w.upsert("a", { n: 1 }, [1, 0, 0]);
  w.upsert("b", { n: 2 }, [0, 1, 0]);
  r.refresh();
  assert.equal(r.count(), 2);
  w.delete("a");
  r.refresh();
  assert.equal(r.get("a"), null);
  assert.equal(r.get("b").n, 2);
});

test("refresh() sin datos nuevos es idempotente", () => {
  const p = base();
  const w = new SemanticCollection({ path: p, dim: 3 });
  w.upsert("a", { n: 1 }, [1, 0, 0]);
  const r = new SemanticCollection({ path: p, dim: 3 });
  r.refresh();
  r.refresh();
  assert.equal(r.get("a").n, 1);
  assert.equal(r.count(), 1);
});

test("refresh() en modo memoria no lanza (no-op)", () => {
  const sc = new SemanticCollection({ dim: 3 });
  sc.refresh();   // sin path => no-op
  assert.equal(sc.count(), 0);
});
