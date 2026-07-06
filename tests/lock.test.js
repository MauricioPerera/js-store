// Tests CONGELADOS (oráculo) del contrato lock (Fase D: lock de un solo escritor).
// Autorados por el PM ANTES de delegar; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { acquireLock, releaseLock } = require("../src/lock.js");

function lockPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsstore-lock-"));
  return path.join(dir, "col.lock");
}

test("acquireLock crea el lockfile con el PID del proceso", () => {
  const lock = lockPath();
  acquireLock(lock);
  try {
    assert.equal(fs.existsSync(lock), true);
    assert.equal(fs.readFileSync(lock, "utf8").trim(), String(process.pid));
  } finally {
    releaseLock(lock);
  }
});

test("acquireLock sobre un lock ya tomado (proceso vivo) lanza", () => {
  const lock = lockPath();
  acquireLock(lock);
  try {
    assert.throws(() => acquireLock(lock));
  } finally {
    releaseLock(lock);
  }
});

test("releaseLock libera y permite volver a adquirir", () => {
  const lock = lockPath();
  acquireLock(lock);
  releaseLock(lock);
  assert.equal(fs.existsSync(lock), false);
  acquireLock(lock); // no debe lanzar
  releaseLock(lock);
});

test("releaseLock de un lock inexistente no lanza (idempotente)", () => {
  const lock = lockPath();
  releaseLock(lock);
  assert.equal(fs.existsSync(lock), false);
});

test("STALE: un lock de un proceso MUERTO se roba", () => {
  const lock = lockPath();
  const deadPid = 424242;
  fs.writeFileSync(lock, String(deadPid), "utf8"); // lock huérfano de otro pid

  // Inyecta: process.kill(deadPid, 0) lanza ESRCH => el impl lo considera muerto.
  const origKill = process.kill;
  process.kill = (pid, sig) => {
    if (pid === deadPid) {
      const e = new Error("no such process");
      e.code = "ESRCH";
      throw e;
    }
    return origKill.call(process, pid, sig);
  };
  try {
    acquireLock(lock); // debe robar el lock stale
    assert.equal(fs.readFileSync(lock, "utf8").trim(), String(process.pid));
  } finally {
    process.kill = origKill;
    releaseLock(lock);
  }
});

test("un lock de un proceso VIVO (distinto pid simulado) NO se roba", () => {
  const lock = lockPath();
  const alivePid = 424243;
  fs.writeFileSync(lock, String(alivePid), "utf8");

  const origKill = process.kill;
  process.kill = (pid, sig) => {
    if (pid === alivePid) return true; // vivo
    return origKill.call(process, pid, sig);
  };
  try {
    assert.throws(() => acquireLock(lock));
  } finally {
    process.kill = origKill;
    releaseLock(lock);
  }
});
