// Tests CONGELADOS (oráculo) del hallazgo A8: compact() robusto ante rename que falla + limpieza
// de .compact huerfano en el constructor. Autorados por el PM; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DiskKV } = require("../src/disk-kv.js");

function dataPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-compact-robusto-"));
  return path.join(dir, "kv.data");
}

// (a) HUERFANO: un "<path>.compact" suelto se borra al construir y el DiskKV funciona.
test("constructor borra un .compact huerfano y deja el DiskKV usable", () => {
  const p = dataPath();
  const kv = new DiskKV(p);
  kv.put("a", { n: 1 });
  kv.put("a", { n: 2 });
  kv.delete("a");
  kv.put("c", { n: 3 });
  // Simula un compact que crasheo ANTES del rename: deja un .compact parcial a mano.
  fs.writeFileSync(p + ".compact", "basura-parcial");
  assert.equal(fs.existsSync(p + ".compact"), true);

  const kv2 = new DiskKV(p); // reabrir limpia el huerfano
  assert.equal(fs.existsSync(p + ".compact"), false, "el .compact huerfano debe borrarse");
  // El archivo real sigue intacto (no compactado): los datos vivos se preservan.
  assert.equal(kv2.get("a"), null);
  assert.deepEqual(kv2.get("c"), { n: 3 });
  // La instancia funciona tras limpiar.
  kv2.put("d", { n: 4 });
  assert.deepEqual(kv2.get("d"), { n: 4 });
});

// (b) FALLO DE RENAME: si renameSync lanza durante compact(), la instancia SIGUE USABLE
// (get/put funcionan, no EBADF), lanza Error de dominio (no el crudo) y no queda tmp .compact.
test("compact ante rename que falla: lanza Error de dominio y la instancia sigue usable", () => {
  const p = dataPath();
  const kv = new DiskKV(p);
  kv.put("a", { n: 1 });
  kv.put("a", { n: 9 }); // version superada
  kv.delete("a");
  kv.put("b", { n: 2 });

  const orig = fs.renameSync;
  let calls = 0;
  fs.renameSync = function (from, to) {
    calls++;
    if (calls === 1) {
      const e = new Error("EPERM: operation not permitted, rename");
      e.code = "EPERM";
      throw e;
    }
    return orig.call(fs, from, to);
  };
  let err;
  try {
    kv.compact();
  } catch (e) {
    err = e;
  } finally {
    fs.renameSync = orig; // restaura el patch siempre
  }
  assert.ok(err, "compact debio lanzar");
  assert.ok(err instanceof Error, "debe ser Error (no el crudo del fs)");
  assert.match(err.message, /compact/, "el mensaje debe ser de dominio (menciona compact)");

  // No queda tmp .compact huerfano.
  assert.equal(fs.existsSync(p + ".compact"), false, "no debe quedar tmp .compact");

  // La instancia SIGUE USABLE: get/put funcionan (no EBADF). El archivo original quedó intacto.
  assert.equal(kv.get("a"), null, "a sigue borrado (estado original, sin compactar)");
  assert.deepEqual(kv.get("b"), { n: 2 }, "b sigue vivo");
  kv.put("c", { n: 3 }); // escritura nueva sobre el fd reabierto
  assert.deepEqual(kv.get("c"), { n: 3 });
  // Persiste: una instancia nueva ve el estado (sin compactar).
  const kv2 = new DiskKV(p);
  assert.deepEqual(kv2.get("b"), { n: 2 });
  assert.deepEqual(kv2.get("c"), { n: 3 });
});

// (c) camino feliz: compact() normal sigue compactando.
test("camino feliz: compact() normal sigue compactando (reduce tamaño y preserva datos)", () => {
  const p = dataPath();
  const kv = new DiskKV(p);
  const big = { blob: "x".repeat(2000) };
  kv.put("a", big);
  kv.put("a", big); // superada
  kv.delete("a");
  kv.put("b", { n: 2 });
  const before = fs.statSync(p).size;
  kv.compact();
  const after = fs.statSync(p).size;
  assert.ok(after < before, `esperaba after (${after}) < before (${before})`);
  assert.equal(kv.get("a"), null);
  assert.deepEqual(kv.get("b"), { n: 2 });
  assert.deepEqual(kv.keys(), ["b"]);
});