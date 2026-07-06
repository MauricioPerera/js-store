// Tests CONGELADOS (oráculo) del contrato semantic-collection-reindex.
// reindex() cablea el IVF en el modo disco: search usa IVF; una mutación lo invalida.
// Autorados por el PM; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { SemanticCollection } = require("../src/semantic-collection.js");

function base() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-reindex-"));
  return path.join(dir, "col");
}

test("reindex: search sigue devolviendo el resultado correcto (nProbe=nClusters, exacto)", () => {
  const sc = new SemanticCollection({ path: base(), dim: 3 });
  sc.upsert("a", { tipo: "post" }, [1, 0, 0]);
  sc.upsert("b", { tipo: "note" }, [0, 1, 0]);
  sc.upsert("c", { tipo: "post" }, [0, 0, 1]);
  sc.reindex(2, 2); // probe todos => exacto
  assert.equal(sc.search([1, 0, 0], { limit: 1 })[0].id, "a");
});

test("reindex + filtro documental sigue funcionando", () => {
  const sc = new SemanticCollection({ path: base(), dim: 3 });
  sc.upsert("a", { tipo: "post" }, [1, 0, 0]);
  sc.upsert("b", { tipo: "note" }, [0.9, 0.1, 0]);
  sc.reindex(2, 2);
  assert.deepEqual(sc.search([1, 0, 0], { filter: { tipo: "post" }, limit: 5 }).map((r) => r.id), ["a"]);
});

test("una mutación invalida el índice: el nuevo doc es encontrable (fallback exacto)", () => {
  const sc = new SemanticCollection({ path: base(), dim: 3 });
  sc.upsert("a", {}, [1, 0, 0]);
  sc.reindex(1, 1); // 1 cluster: sin invalidar, un nuevo doc no se encontraría
  sc.upsert("z", {}, [0, 1, 0]); // invalida el IVF
  assert.equal(sc.search([0, 1, 0], { limit: 1 })[0].id, "z");
});

test("reindex fuera del modo disco lanza", () => {
  const sc = new SemanticCollection({ dim: 3 }); // modo RAM
  assert.throws(() => sc.reindex(2, 2));
});

test("NO-RAM: reindex tras reabrir reconstruye desde disco y busca", () => {
  const p = base();
  const w = new SemanticCollection({ path: p, dim: 3 });
  w.upsert("a", {}, [1, 0, 0]);
  w.upsert("b", {}, [0, 1, 0]);
  const r = new SemanticCollection({ path: p, dim: 3 }); // instancia nueva
  r.reindex(2, 2);
  assert.equal(r.search([1, 0, 0], { limit: 1 })[0].id, "a");
});
