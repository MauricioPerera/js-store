// Tests CONGELADOS (oráculo) del contrato semantic-collection-ivf-persist.
// reindex guarda el índice; el modo disco auto-carga al abrir; una mutación lo invalida en disco.
// Autorados por el PM; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { SemanticCollection } = require("../src/semantic-collection.js");

function base() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-scivfp-"));
  return path.join(dir, "col");
}

test("reindex guarda el índice IVF en disco", () => {
  const p = base();
  const sc = new SemanticCollection({ path: p, dim: 3 });
  sc.upsert("a", {}, [1, 0, 0]);
  sc.upsert("b", {}, [0, 1, 0]);
  sc.reindex(2, 2);
  assert.ok(fs.existsSync(p + ".vecs.ivf"));
});

test("reabrir tras reindex AUTO-CARGA el índice: search correcto SIN reindex", () => {
  const p = base();
  const w = new SemanticCollection({ path: p, dim: 3 });
  w.upsert("a", { tipo: "post" }, [1, 0, 0]);
  w.upsert("b", { tipo: "note" }, [0, 1, 0]);
  w.reindex(2, 2);
  const r = new SemanticCollection({ path: p, dim: 3 }); // auto-carga el índice
  assert.ok(r._diskIvf, "el índice IVF debe auto-cargarse al abrir"); // discriminador
  assert.equal(r.search([1, 0, 0], { limit: 1 })[0].id, "a"); // sin llamar reindex
  assert.deepEqual(r.search([1, 0, 0], { filter: { tipo: "post" }, limit: 5 }).map((x) => x.id), ["a"]);
});

test("una mutación invalida el índice persistido: al reabrir, el nuevo doc es encontrable", () => {
  const p = base();
  const w = new SemanticCollection({ path: p, dim: 3 });
  w.upsert("a", {}, [1, 0, 0]);
  w.reindex(1, 1); // 1 cluster; un índice stale no encontraría un doc nuevo del otro lado
  w.upsert("z", {}, [0, 1, 0]); // debe invalidar el índice persistido
  const r = new SemanticCollection({ path: p, dim: 3 }); // NO debe auto-cargar un índice stale
  assert.equal(r._diskIvf, null, "un índice stale (post-mutación) no debe auto-cargarse");
  assert.equal(r.search([0, 1, 0], { limit: 1 })[0].id, "z");
});

test("sin reindex previo: reabrir no auto-carga nada (search exacto sigue funcionando)", () => {
  const p = base();
  const w = new SemanticCollection({ path: p, dim: 3 });
  w.upsert("a", {}, [1, 0, 0]);
  const r = new SemanticCollection({ path: p, dim: 3 });
  assert.equal(r.search([1, 0, 0], { limit: 1 })[0].id, "a");
});
