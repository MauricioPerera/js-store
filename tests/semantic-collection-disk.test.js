// Tests CONGELADOS (oráculo) del contrato semantic-collection-disk (fase 4).
// SemanticCollection en modo DISCO ({ path }): docs+vectores en disco, no en RAM.
// La clave: una instancia NUEVA sobre el mismo path ve todo. Autorados por el PM; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { SemanticCollection } = require("../src/semantic-collection.js");

function base() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-scdisk-"));
  return path.join(dir, "col");
}

test("modo disco: upsert + get + search en la misma instancia", () => {
  const sc = new SemanticCollection({ path: base(), dim: 3 });
  sc.upsert("a", { tipo: "post" }, [1, 0, 0]);
  sc.upsert("b", { tipo: "note" }, [0, 1, 0]);
  assert.equal(sc.get("a").tipo, "post");
  assert.equal(sc.search([1, 0, 0], { limit: 1 })[0].id, "a");
});

test("NO-RAM: instancia NUEVA sobre el mismo path VE los datos y busca sobre ellos", () => {
  const p = base();
  const w = new SemanticCollection({ path: p, dim: 3 });
  w.upsert("a", { tipo: "post" }, [1, 0, 0]);
  w.upsert("b", { tipo: "note" }, [0, 1, 0]);
  // instancia distinta, sin memoria compartida:
  const r = new SemanticCollection({ path: p, dim: 3 });
  assert.equal(r.get("a").tipo, "post");
  assert.equal(r.count(), 2);
  assert.equal(r.search([1, 0, 0], { limit: 1 })[0].id, "a");
});

test("NO-RAM: el filtro documental funciona en modo disco tras reabrir", () => {
  const p = base();
  const w = new SemanticCollection({ path: p, dim: 3 });
  w.upsert("a", { tipo: "post" }, [1, 0, 0]);
  w.upsert("b", { tipo: "note" }, [0.9, 0.1, 0]);
  const r = new SemanticCollection({ path: p, dim: 3 });
  assert.deepEqual(r.search([1, 0, 0], { filter: { tipo: "post" }, limit: 5 }).map((x) => x.id), ["a"]);
});

test("NO-RAM: delete persiste (instancia nueva no lo ve)", () => {
  const p = base();
  const w = new SemanticCollection({ path: p, dim: 3 });
  w.upsert("a", { tipo: "post" }, [1, 0, 0]);
  w.upsert("b", { tipo: "note" }, [0, 1, 0]);
  w.delete("a");
  const r = new SemanticCollection({ path: p, dim: 3 });
  assert.equal(r.get("a"), null);
  assert.equal(r.count(), 1);
});

test("modo disco: searchHybrid funciona", () => {
  const sc = new SemanticCollection({ path: base(), dim: 3 });
  sc.upsert("a", { text: "alpha" }, [1, 0, 0]);
  sc.upsert("b", { text: "beta" }, [0, 1, 0]);
  const res = sc.searchHybrid([1, 0, 0], "beta", {
    mode: "weighted",
    vectorWeight: 0,
    textWeight: 1,
    limit: 1,
  });
  assert.equal(res[0].id, "b");
});

test("dos colecciones en disco con paths distintos son independientes", () => {
  const a = new SemanticCollection({ path: base(), dim: 3 });
  const b = new SemanticCollection({ path: base(), dim: 3 });
  a.upsert("x", {}, [1, 0, 0]);
  assert.equal(a.count(), 1);
  assert.equal(b.count(), 0);
});
