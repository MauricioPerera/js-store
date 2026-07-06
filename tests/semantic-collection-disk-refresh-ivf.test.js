// Tests CONGELADOS (oráculo) del contrato semantic-collection-disk-refresh-ivf.
// Un lector de larga vida que auto-cargó un IVF NO debe devolver resultados stale tras
// refresh(): si el escritor mutó (borró el .ivf con _dropIvf), refresh() invalida el
// índice en memoria del lector y este vuelve a escaneo EXACTO (ve las escrituras nuevas).
// Reproduce el hallazgo de auditoría. Autorados por el PM; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { SemanticCollection } = require("../src/semantic-collection.js");

function base() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-refivf-"));
  return path.join(dir, "col");
}

// Vector determinista de dim 4 a partir de un índice (evita Math.random).
function vec(i) {
  return [i % 3, (i + 1) % 3, (i + 2) % 3, (i % 5) / 5];
}

test("lector de larga vida con IVF auto-cargado ve el upsert nuevo tras refresh() (no stale)", () => {
  const p = base();
  const w = new SemanticCollection({ path: p, dim: 4 });
  for (let i = 0; i < 30; i++) w.upsert("d" + i, { n: i }, vec(i));
  w.reindex(4, 4);                       // construye + persiste el .ivf

  // El lector abre DESPUÉS del reindex => auto-carga el .ivf en memoria.
  const r = new SemanticCollection({ path: p, dim: 4 });
  assert.equal(r._diskIvf != null, true, "precondición: el lector auto-cargó el IVF");

  // El escritor inserta un TARGET distintivo (esto ejecuta _dropIvf => borra el .ivf).
  w.upsert("TARGET", { n: 999 }, [1, 1, 1, 1]);

  r.refresh();                           // el lector releé la cola
  const hits = r.search([1, 1, 1, 1], { limit: 5 });
  assert.ok(hits.some((h) => h.id === "TARGET"),
    "tras refresh(), la búsqueda del lector debe encontrar el vector nuevo (no quedar stale en el IVF viejo)");
});

test("sin mutación del escritor, refresh() conserva el IVF activo (no lo invalida gratis)", () => {
  const p = base();
  const w = new SemanticCollection({ path: p, dim: 4 });
  for (let i = 0; i < 20; i++) w.upsert("d" + i, { n: i }, vec(i));
  w.reindex(4, 4);
  const r = new SemanticCollection({ path: p, dim: 4 });
  assert.equal(r._diskIvf != null, true);
  r.refresh();                           // no hubo mutación => el .ivf sigue en disco
  assert.equal(r._diskIvf != null, true, "sin mutación, el IVF del lector sigue activo");
});
