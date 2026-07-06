---
type: 'Task Contract'
title: 'Lock de un solo escritor (lockfile con PID)'
description: 'Módulo de lock: acquireLock crea un lockfile exclusivo con el PID y roba locks huérfanos de procesos muertos; releaseLock lo libera.'
tags: ['js-store', 'ccdd', 'durabilidad', 'lock', 'fs']

task: lock
intent: "Adquirir un lock exclusivo de escritor mediante un lockfile con el PID."
target: src/lock.js
signature: "acquireLock(lockPath)"
language: javascript
test_command: "node --test tests/lock.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/lock.test.js
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: lock

## Intent
Primitiva de la Fase D de durabilidad: un lock de **un solo escritor** para evitar que dos
procesos abran a la vez el mismo WAL/snapshot (corrupción). Módulo nuevo `src/lock.js` que
usa un **lockfile** creado atómicamente y guarda el PID del dueño; si el dueño está muerto
(lock huérfano tras un crash), lo **roba**. Solo `node:fs` de stdlib.

## Interface
```js
_isAlive(pid) -> boolean
//   true si el proceso `pid` sigue vivo. Implementación: process.kill(pid, 0) — si no lanza,
//   está vivo; si lanza con code "EPERM" también (vivo, sin permiso); si "ESRCH", muerto.

acquireLock(lockPath) -> void
//   Crea el lockfile atómicamente con fs.openSync(lockPath, "wx") y escribe String(process.pid).
//   Si ya existe: lee el PID; si _isAlive(pid) => lanza Error("...bloqueado por..."). Si el
//   dueño está muerto (stale) => borra el lockfile y lo re-crea a nombre de este proceso.

releaseLock(lockPath) -> void
//   Borra el lockfile si existe (idempotente: no lanza si no existe).
```

## Invariants
- `acquireLock` usa creación **atómica exclusiva** (`fs.openSync(lockPath, "wx")`): si el
  archivo existe, el open lanza `EEXIST` y NO se sobrescribe a ciegas.
- Tras `acquireLock`, el lockfile contiene `String(process.pid)`.
- Segundo `acquireLock` con el lock tomado por un proceso VIVO => lanza.
- Lock **stale** (PID del dueño muerto según `_isAlive`) => se roba: se re-crea a nombre del
  proceso actual y `acquireLock` no lanza.
- `releaseLock` borra el lockfile; de un lock inexistente no lanza.
- Solo `node:fs` (namespace) + `process.kill`; sin red/subprocess; IO síncrono.

## Examples
- acquireLock(p); readFileSync(p) === String(process.pid). Segundo acquireLock(p) lanza.
- releaseLock(p); acquireLock(p) vuelve a funcionar.
- lockfile con PID muerto => acquireLock lo roba.

## Do / Don't
- DO: `fs.openSync(lockPath, "wx")`; en `_isAlive`, `process.kill(pid, 0)` en try/catch (ESRCH=muerto, EPERM=vivo).
- DO: en el caso stale, `fs.unlinkSync` y re-crear con `"wx"`.
- DON'T: sobrescribir el lockfile sin comprobar el dueño; usar red/subprocess.
- DON'T: tocar `tests/`, `knowledge/`, `src/vendor/`, `src/semantic-collection.js`, `src/wal.js`, `scripts/`.

## Tests
(Congelados en `tests/lock.test.js`, incluida la detección de lock stale mediante inyección
sobre `process.kill`. La suite completa debe seguir verde.)

## Constraints
- PARAR y reportar si... la creación atómica del lockfile o la detección de liveness no fueran
  posibles con `node:fs`/`process.kill` en este entorno; documentar el porqué y responder BLOQUEADO.
