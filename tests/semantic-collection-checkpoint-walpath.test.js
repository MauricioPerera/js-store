// Tests CONGELADOS (oráculo) del hallazgo A1 (espejo de H4): checkpoint() con snapshotPath
// pero SIN walPath debe lanzar un Error de dominio que mencione walPath, no un TypeError crudo
// de fs. openDurable({ path, dim }) SIN walPath es config aceptada (walPath opcional);
// checkpoint() en esa config tocaba fs.writeFileSync(null) y reventaba con TypeError.
// Autorados por el PM; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readOps } = require("../src/wal.js");
const { SemanticCollection } = require("../src/semantic-collection.js");

function paths() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-ckpt-walpath-"));
  return { snap: path.join(dir, "col.json"), wal: path.join(dir, "col.wal") };
}

test("checkpoint SIN walPath lanza Error de dominio (menciona walPath), no TypeError de fs", () => {
  const { snap } = paths();
  // path SIN walPath: config aceptada (walPath opcional).
  const sc = SemanticCollection.openDurable({ path: snap, dim: 3 });
  sc.upsert("a", { n: 1 }, [1, 0, 0]);
  let err;
  try {
    sc.checkpoint();
  } catch (e) {
    err = e;
  }
  assert.ok(err, "checkpoint debio lanzar sin walPath");
  assert.ok(err instanceof Error, "debe ser un Error (no TypeError crudo de fs)");
  assert.equal(err.name, "Error", "no debe ser TypeError");
  assert.match(err.message, /walPath/, "el mensaje debe mencionar walPath");
});

test("checkpoint CON path Y walPath sigue funcionando (trunca el WAL)", () => {
  const { snap, wal } = paths();
  const sc = SemanticCollection.openDurable({ path: snap, walPath: wal, dim: 3 });
  sc.upsert("a", { n: 1 }, [1, 0, 0]);
  assert.equal(readOps(wal).length, 1);
  sc.checkpoint();
  assert.equal(fs.existsSync(snap), true);
  assert.deepEqual(readOps(wal), []);
  const re = SemanticCollection.openDurable({ path: snap, walPath: wal, dim: 3 });
  assert.equal(re.get("a").n, 1);
});