// Tests CONGELADOS (oráculo) del contrato semantic-collection-validate.
// upsert valida la entrada (validateInput) y rechaza sin dejar estado parcial.
// Autorados por el PM ANTES de delegar; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { SemanticCollection } = require("../src/semantic-collection.js");

test("upsert con id inválido lanza (mensaje nombra id)", () => {
  const sc = new SemanticCollection({ dim: 3 });
  assert.throws(() => sc.upsert("", { a: 1 }, [1, 0, 0]), /id/);
});

test("upsert con doc null lanza (nombra doc)", () => {
  const sc = new SemanticCollection({ dim: 3 });
  assert.throws(() => sc.upsert("a", null, [1, 0, 0]), /doc/);
});

test("upsert con doc array lanza", () => {
  const sc = new SemanticCollection({ dim: 3 });
  assert.throws(() => sc.upsert("a", [], [1, 0, 0]), /doc/);
});

test("upsert con vector de longitud != dim lanza (nombra vector)", () => {
  const sc = new SemanticCollection({ dim: 3 });
  assert.throws(() => sc.upsert("a", {}, [1, 0]), /vector/);
});

test("upsert con vector con NaN o Infinity lanza", () => {
  const sc = new SemanticCollection({ dim: 3 });
  assert.throws(() => sc.upsert("a", {}, [1, NaN, 3]), /vector/);
  assert.throws(() => sc.upsert("a", {}, [1, Infinity, 3]), /vector/);
});

test("un upsert rechazado NO modifica el estado (sin escritura parcial)", () => {
  const sc = new SemanticCollection({ dim: 3 });
  try {
    sc.upsert("a", {}, [1, 0]); // vector inválido
  } catch {
    /* esperado */
  }
  assert.equal(sc.count(), 0);
  assert.equal(sc.get("a"), null);
});

test("upsert válido sigue funcionando (regresión)", () => {
  const sc = new SemanticCollection({ dim: 3 });
  assert.equal(sc.upsert("a", { tipo: "post" }, [1, 0, 0]), "a");
  assert.equal(sc.get("a").tipo, "post");
});

test("upsertMany con un item inválido lanza", () => {
  const sc = new SemanticCollection({ dim: 3 });
  assert.throws(
    () =>
      sc.upsertMany([
        { id: "a", doc: {}, vector: [1, 0, 0] },
        { id: "", doc: {}, vector: [0, 1, 0] },
      ]),
    /id/
  );
});

test("el error acumula varias violaciones simultáneas", () => {
  const sc = new SemanticCollection({ dim: 3 });
  assert.throws(
    () => sc.upsert("", null, [1]),
    (e) => /id/.test(e.message) && /doc/.test(e.message) && /vector/.test(e.message)
  );
});
