// Tests CONGELADOS (oráculo) de los hallazgos H2/H3/H4 de la auditoría externa.
// Sanan ventanas de crash/misuse: serialize() ante doc sin vector, search/searchHybrid
// ante vector sin doc, y checkpoint() sin snapshotPath. Los estados inconsistentes se
// forzan por inyección/manipulación controlada de los cores, NO parcheando producción.
// Autorados por el PM ANTES de delegar; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { SemanticCollection } = require("../src/semantic-collection.js");

// --- H2: serialize() lanza Error de dominio ante un doc huerfano (sin vector) ---

test("H2: serialize() lanza Error de dominio (no TypeError) nombrando el id huerfano", () => {
  const sc = new SemanticCollection({ dim: 3, col: "c" });
  sc.upsert("a", { n: 1 }, [1, 0, 0]);
  sc.upsert("b", { n: 2 }, [0, 1, 0]);
  // Estado inconsistente: el doc "b" queda sin vector (crash a mitad de compact / manipulación).
  sc.vectorStore.remove(sc.col, "b");

  assert.throws(
    () => sc.serialize(),
    (err) => err instanceof Error
      && err.name !== "TypeError"
      && /serialize:/.test(err.message)
      && /"b"/.test(err.message)
  );
});

test("H2: serialize() feliz sigue funcionando (todo doc tiene vector)", () => {
  const sc = new SemanticCollection({ dim: 3, col: "c" });
  sc.upsert("a", { n: 1 }, [1, 0, 0]);
  sc.upsert("b", { n: 2 }, [0, 1, 0]);
  const data = sc.serialize();
  assert.equal(data.records.length, 2);
  assert.deepEqual(
    data.records.map((r) => r.id).sort(),
    ["a", "b"]
  );
});

// --- H3: search/searchHybrid SIN filtro no devuelven hits con doc:null ---

test("H3: search() sin filtro excluye al huerfano (vector-sin-doc), sin devolver doc null", () => {
  const sc = new SemanticCollection({ dim: 3, col: "c" });
  sc.upsert("a", { n: 1 }, [1, 0, 0]);
  sc.upsert("b", { n: 2 }, [0, 1, 0]);
  // Huerfano: el vector de "b" queda sin su doc.
  sc.docCollection.remove({ _id: "b" });

  const res = sc.search([0, 1, 0], { limit: 5 });
  // Ningún hit con doc null.
  assert.equal(res.some((r) => r.doc == null), false);
  // El huerfano no aparece (no tiene documento).
  assert.equal(res.some((r) => r.id === "b"), false);
  // El doc sano sigue llegando.
  assert.equal(res.some((r) => r.id === "a"), true);
});

test("H3: search() caso normal (todos con doc) devuelve los resultados correctos", () => {
  const sc = new SemanticCollection({ dim: 3, col: "c" });
  sc.upsert("a", { n: 1 }, [1, 0, 0]);
  sc.upsert("b", { n: 2 }, [0, 1, 0]);
  const res = sc.search([1, 0, 0], { limit: 5 });
  assert.equal(res.length, 2);
  assert.equal(res.every((r) => r.doc != null), true);
  assert.equal(res[0].id, "a"); // el más cercano al query
});

test("H3: searchHybrid() sin filtro excluye al huerfano, sin devolver doc null", () => {
  const sc = new SemanticCollection({ dim: 3, col: "c" });
  sc.upsert("a", { tipo: "post", text: "alpha beta" }, [1, 0, 0]);
  sc.upsert("b", { tipo: "note", text: "beta gamma" }, [0, 1, 0]);
  // Huerfano: el vector de "b" queda sin su doc.
  sc.docCollection.remove({ _id: "b" });

  const res = sc.searchHybrid([0, 1, 0], "beta", { textField: "text", limit: 5 });
  assert.equal(res.some((r) => r.doc == null), false);
  assert.equal(res.some((r) => r.id === "b"), false);
  assert.equal(res.some((r) => r.id === "a"), true);
});

test("H3: searchHybrid() caso normal (todos con doc) devuelve los resultados correctos", () => {
  const sc = new SemanticCollection({ dim: 3, col: "c" });
  sc.upsert("a", { tipo: "post", text: "alpha beta" }, [1, 0, 0]);
  sc.upsert("b", { tipo: "note", text: "beta gamma" }, [0, 1, 0]);
  const res = sc.searchHybrid([1, 0, 0], "alpha", { textField: "text", limit: 5 });
  assert.equal(res.length, 2);
  assert.equal(res.every((r) => r.doc != null), true);
  assert.equal(res[0].id, "a");
});

// --- H4: checkpoint() sin snapshotPath lanza Error de dominio (no TypeError de fs) ---

test("H4: openDurable({walPath}) sin path -> checkpoint() lanza Error de dominio que menciona snapshotPath/path", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-h4-"));
  const wal = path.join(dir, "col.wal");
  const sc = SemanticCollection.openDurable({ walPath: wal, dim: 3 });
  sc.upsert("a", { n: 1 }, [1, 0, 0]);

  assert.throws(
    () => sc.checkpoint(),
    (err) => err instanceof Error
      && err.name !== "TypeError"
      && /snapshotPath|path/.test(err.message)
  );
});

test("H4: openDurable con path -> checkpoint() crea el snapshot y trunca el WAL", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-h4ok-"));
  const snap = path.join(dir, "col.json");
  const wal = path.join(dir, "col.wal");
  const sc = SemanticCollection.openDurable({ path: snap, walPath: wal, dim: 3 });
  sc.upsert("a", { n: 1 }, [1, 0, 0]);
  const out = sc.checkpoint();
  assert.equal(out, snap);
  assert.equal(fs.existsSync(snap), true);
  // Reabrir: el estado persiste en el snapshot y el WAL quedó truncado.
  const re = SemanticCollection.openDurable({ path: snap, walPath: wal, dim: 3 });
  assert.equal(re.get("a").n, 1);
});