// Tests CONGELADOS (oráculo) del contrato semantic-collection-atomic-save.
// saveToFile debe ser CRASH-SAFE: escribe a un temporal y hace rename atómico, de modo que
// un fallo a mitad NO corrompe el archivo previo. Autorados por el PM; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { SemanticCollection } = require("../src/semantic-collection.js");

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-atomic-"));
  return path.join(dir, "col.json");
}

function seeded() {
  const sc = new SemanticCollection({ dim: 3, col: "c" });
  sc.upsert("a", { tipo: "post", n: 1 }, [1, 0, 0]);
  sc.upsert("b", { tipo: "note", n: 2 }, [0, 1, 0]);
  return sc;
}

test("CRASH-SAFETY: un fallo en el rename NO corrompe el archivo previo", () => {
  const file = tmpFile();
  const good = new SemanticCollection({ dim: 3 });
  good.upsert("a", { n: 1 }, [1, 0, 0]);
  good.saveToFile(file);
  const goodContent = fs.readFileSync(file, "utf8");

  // Inyecta un "crash" en el punto de commit (rename). Como el módulo usa fs.renameSync
  // en forma namespace, parchear fs.renameSync afecta a la implementación.
  const orig = fs.renameSync;
  fs.renameSync = () => {
    throw new Error("simulated crash during rename");
  };
  try {
    const other = new SemanticCollection({ dim: 3 });
    other.upsert("z", { n: 9 }, [1, 0, 0]);
    assert.throws(() => other.saveToFile(file));
  } finally {
    fs.renameSync = orig;
  }

  // El archivo original sigue intacto y cargable con el estado bueno.
  assert.equal(fs.readFileSync(file, "utf8"), goodContent);
  const loaded = SemanticCollection.loadFromFile(file);
  assert.equal(loaded.get("a").n, 1);
  assert.equal(loaded.get("z"), null);
});

test("no deja archivos temporales tras un guardado exitoso", () => {
  const file = tmpFile();
  const dir = path.dirname(file);
  seeded().saveToFile(file);
  assert.deepEqual(fs.readdirSync(dir), ["col.json"]);
});

test("sobrescribir reemplaza por completo y queda válido", () => {
  const file = tmpFile();
  const big = new SemanticCollection({ dim: 3 });
  big.upsert("a", { n: 1 }, [1, 0, 0]);
  big.upsert("b", { n: 2 }, [0, 1, 0]);
  big.upsert("c", { n: 3 }, [0, 0, 1]);
  big.saveToFile(file);

  const small = new SemanticCollection({ dim: 3 });
  small.upsert("x", { n: 9 }, [1, 0, 0]);
  small.saveToFile(file);

  const loaded = SemanticCollection.loadFromFile(file);
  assert.equal(loaded.count(), 1);
  assert.equal(loaded.get("x").n, 9);
  assert.equal(loaded.get("a"), null);
});

test("round-trip preservado (regresión)", () => {
  const file = tmpFile();
  const sc = seeded();
  sc.saveToFile(file);
  const restored = SemanticCollection.loadFromFile(file);
  assert.deepEqual(
    restored.search([1, 0, 0], { limit: 2 }).map((r) => r.id),
    sc.search([1, 0, 0], { limit: 2 }).map((r) => r.id)
  );
});

test("saveToFile devuelve la ruta", () => {
  const file = tmpFile();
  assert.equal(seeded().saveToFile(file), file);
});
