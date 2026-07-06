// Tests CONGELADOS del fix H1: begin() lanza en modo disco (las tx son de memoria).
// En modo disco un upsert dentro de la tx hace fsync directo al log y rollback restaura
// cores en memoria sin tocar _diskVecPath -> estado divergente + la op persiste al reabrir.
// La guarda prohíbe arrancar la tx en disco en lugar de corromper en silencio.
// Autorados por el PM; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { SemanticCollection } = require("../src/semantic-collection.js");

function diskPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-tx-disk-"));
  return path.join(dir, "col");
}

test("H1(a): en modo disco begin() lanza con mensaje de modo y la instancia no se altera", () => {
  const base = diskPath();
  const sc = new SemanticCollection({ path: base, dim: 3 });
  sc.upsert("a", { n: 1 }, [1, 0, 0]);
  assert.equal(sc.get("a").n, 1);
  const vecPathBefore = sc._diskVecPath;

  assert.throws(
    () => sc.begin(),
    /solo están disponibles en modo memoria/
  );

  // No entró en tx: _tx sigue null y _diskVecPath intacto (no quedó híbrida).
  assert.equal(sc._tx, null);
  assert.equal(sc._diskVecPath, vecPathBefore);
  // El estado previo sigue accesible.
  assert.equal(sc.get("a").n, 1);
  assert.equal(sc.count(), 1);
});

test("H1(b): en modo MEMORIA begin->upsert->rollback deshace y begin->upsert->commit persiste", () => {
  const sc = new SemanticCollection({ dim: 3 });

  sc.begin();
  sc.upsert("a", { n: 1 }, [1, 0, 0]);
  sc.rollback();
  assert.equal(sc.get("a"), null);
  assert.equal(sc.count(), 0);

  sc.begin();
  sc.upsert("b", { n: 2 }, [0, 1, 0]);
  sc.commit();
  assert.equal(sc.get("b").n, 2);
  assert.equal(sc.count(), 1);
});

test("H1(c): reproduce el escenario del audit — en disco begin lanza ANTES del upsert divergente", () => {
  const base = diskPath();
  const sc = new SemanticCollection({ path: base, dim: 3 });
  sc.upsert("a", { n: 1 }, [1, 0, 0]);

  // El path divergente del audit: begin -> upsert("b") -> rollback.
  // Con la guarda, begin lanza y el upsert("b") nunca llega a ejecutarse dentro de una tx.
  assert.throws(() => sc.begin(), /solo están disponibles en modo memoria/);
  // No hay tx activa -> el upsert cae por el camino sin tx (no diverge).
  sc.upsert("b", { n: 2 }, [0, 1, 0]);
  assert.equal(sc.get("b").n, 2);

  // Al reabrir desde disco, "b" está porque fue un upsert normal (no un rollback fallido).
  const reopened = new SemanticCollection({ path: base, dim: 3 });
  assert.equal(reopened.get("a").n, 1);
  assert.equal(reopened.get("b").n, 2);
});