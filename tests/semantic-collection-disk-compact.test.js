// Tests CONGELADOS (oráculo) del contrato semantic-collection-disk-compact.
// compact() en modo disco reescribe los logs (docs + vectores) dropeando tombstones y
// versiones superadas: los datos vivos se preservan y el archivo se achica. No-op en memoria.
// Autorados por el PM; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { SemanticCollection } = require("../src/semantic-collection.js");

function base() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-sccompact-"));
  return path.join(dir, "col");
}

test("compact() preserva los datos vivos y achica el log tras borrados/sobreescrituras", () => {
  const p = base();
  const sc = new SemanticCollection({ path: p, dim: 3 });
  for (let i = 0; i < 20; i++) sc.upsert("d" + i, { n: i }, [i, 0, 0]);
  for (let i = 0; i < 20; i++) sc.upsert("d" + i, { n: i * 10 }, [i, 1, 0]); // sobreescribe (versiones viejas)
  for (let i = 0; i < 10; i++) sc.delete("d" + i);                          // tombstones

  const docsBefore = fs.statSync(p + ".docs").size;
  const vecsBefore = fs.statSync(p + ".vecs").size;

  sc.compact();

  // Datos vivos intactos: quedan d10..d19 con su última versión.
  assert.equal(sc.count(), 10);
  assert.equal(sc.get("d15").n, 150);
  assert.equal(sc.get("d5"), null); // borrado sigue borrado
  const hits = sc.search([19, 1, 0], { limit: 3 });
  assert.ok(hits.some((h) => h.id === "d19"));

  // El log se achicó (se dropearon 20 sobreescrituras + 10 tombstones + 10 vivos borrados).
  assert.ok(fs.statSync(p + ".docs").size < docsBefore, "el log de docs debe achicarse");
  assert.ok(fs.statSync(p + ".vecs").size < vecsBefore, "el log de vectores debe achicarse");
});

test("los datos persisten tras compact(): una instancia nueva los ve", () => {
  const p = base();
  const sc = new SemanticCollection({ path: p, dim: 3 });
  sc.upsert("a", { n: 1 }, [1, 0, 0]);
  sc.upsert("b", { n: 2 }, [0, 1, 0]);
  sc.delete("a");
  sc.compact();

  const r = new SemanticCollection({ path: p, dim: 3 });
  assert.equal(r.count(), 1);
  assert.equal(r.get("b").n, 2);
  assert.equal(r.get("a"), null);
});

test("compact() en modo memoria es no-op (no lanza)", () => {
  const sc = new SemanticCollection({ dim: 3 });
  sc.upsert("a", { n: 1 }, [1, 0, 0]);
  sc.compact();
  assert.equal(sc.count(), 1);
});
