// Tests CONGELADOS (oráculo) del contrato semantic-collection-file.
// saveToFile/loadFromFile: persistencia a disco (envoltorio sobre serialize/deserialize).
// Autorados por el PM ANTES de delegar; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { SemanticCollection } = require("../src/semantic-collection.js");

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-"));
  return path.join(dir, "col.json");
}

function seeded() {
  const sc = new SemanticCollection({ dim: 3, col: "c" });
  sc.upsert("a", { tipo: "post", n: 1 }, [1, 0, 0]);
  sc.upsert("b", { tipo: "note", n: 2 }, [0, 1, 0]);
  return sc;
}

test("round-trip por disco preserva la búsqueda (ranking + doc)", () => {
  const file = tmpFile();
  const sc = seeded();
  sc.saveToFile(file);
  const restored = SemanticCollection.loadFromFile(file);
  const before = sc.search([1, 0, 0], { limit: 2 });
  const after = restored.search([1, 0, 0], { limit: 2 });
  assert.deepEqual(after.map((r) => r.id), before.map((r) => r.id));
  assert.deepEqual(after.map((r) => r.doc.n), before.map((r) => r.doc.n));
});

test("round-trip por disco preserva el filtro documental", () => {
  const file = tmpFile();
  seeded().saveToFile(file);
  const restored = SemanticCollection.loadFromFile(file);
  const res = restored.search([1, 0, 0], { filter: { tipo: "post" }, limit: 5 });
  assert.deepEqual(res.map((r) => r.id), ["a"]);
});

test("el archivo escrito es JSON válido igual a serialize()", () => {
  const file = tmpFile();
  const sc = seeded();
  sc.saveToFile(file);
  const onDisk = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.deepEqual(onDisk, sc.serialize());
});

test("saveToFile devuelve la ruta", () => {
  const file = tmpFile();
  assert.equal(seeded().saveToFile(file), file);
});

test("colección vacía: round-trip por disco => búsqueda vacía", () => {
  const file = tmpFile();
  new SemanticCollection({ dim: 3 }).saveToFile(file);
  const restored = SemanticCollection.loadFromFile(file);
  assert.deepEqual(restored.search([1, 0, 0]), []);
});

test("la colección cargada es independiente del original", () => {
  const file = tmpFile();
  const sc = seeded();
  sc.saveToFile(file);
  const restored = SemanticCollection.loadFromFile(file);
  restored.upsert("z", { tipo: "post", n: 9 }, [1, 1, 0]);
  assert.equal(sc.search([1, 1, 0], { limit: 10 }).some((r) => r.id === "z"), false);
});
