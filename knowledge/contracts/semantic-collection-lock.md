---
type: 'Task Contract'
title: 'Lock de un solo escritor en SemanticCollection (openDurable + close)'
description: 'openDurable adquiere un lock opcional (lockPath) para impedir dos escritores sobre el mismo WAL; close() lo libera.'
tags: ['js-store', 'ccdd', 'semantic', 'durabilidad', 'lock']

task: semantic-collection-lock
intent: "Adquirir un lock de escritor al abrir la coleccion durable cuando se pasa lockPath."
target: src/semantic-collection.js
signature: "openDurable(opts)"
language: javascript
test_command: "node --test tests/semantic-collection-lock.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/semantic-collection-lock.test.js
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: semantic-collection-lock

## Intent
Fase D2: conectar el [módulo lock](../../src/lock.js) a
[`SemanticCollection`](../../src/semantic-collection.js) para garantizar **un solo escritor**
sobre un WAL/snapshot. `openDurable` acepta un `lockPath` **opcional**: si se pasa, adquiere
el lock ANTES de cargar; `close()` lo libera. Opt-in: sin `lockPath` el comportamiento no
cambia. Cambio ADITIVO: modifica `openDurable` e implementa el stub `close()`.

## Interface
```js
SemanticCollection.openDurable({ path, walPath, dim, col, lockPath }) -> SemanticCollection
//   Si lockPath: acquireLock(lockPath) como PRIMER paso (lanza si otro proceso VIVO lo tiene;
//   roba un lock huérfano de proceso muerto — vía el módulo lock). Guarda this._lockPath.
//   Sin lockPath: this._lockPath = null y ninguna adquisición (comportamiento actual).

sc.close() -> void
//   Si this._lockPath: releaseLock(this._lockPath) y this._lockPath = null. Sin lock: no-op
//   (no lanza).
```

## Invariants
- Con `lockPath`: tras `openDurable` existe el lockfile con `String(process.pid)`; un segundo
  `openDurable` con el mismo `lockPath` (dueño vivo) **lanza**.
- `acquireLock` es el PRIMER paso de `openDurable` cuando hay `lockPath` (falla rápido antes de
  cargar/replay).
- Lock **stale** (dueño muerto): `openDurable` lo roba y abre (delegado en el módulo lock).
- `close()` libera el lock (lockfile eliminado) y permite reabrir; sin lock activo, `close()`
  no lanza.
- **Opt-in**: sin `lockPath`, no se crea ni comprueba lock; reabrir sin cerrar sigue
  funcionando (regresión de `openDurable`).
- Usa `acquireLock`/`releaseLock` de `src/lock.js` (no reimplementa el lock). Solo stdlib.

## Examples
- openDurable({...,lockPath}) -> lockfile con pid. Segundo openDurable con ese lockPath lanza.
- close() -> lockfile borrado; reabrir funciona.
- Sin lockPath -> sin lockfile; reabrir sin cerrar funciona.

## Do / Don't
- DO: `const { acquireLock, releaseLock } = require("./lock.js");`; en `openDurable`, si
  `lockPath != null`, `acquireLock(lockPath)` antes de construir/replay; setear `sc._lockPath`.
- DO: en `close()`, `if (this._lockPath) { releaseLock(this._lockPath); this._lockPath = null; }`.
- DON'T: adquirir lock sin `lockPath`; reimplementar el lock; romper el modo sin `lockPath`.
- DON'T: tocar `tests/`, `knowledge/`, `src/vendor/`, `src/lock.js`, `src/wal.js`, `src/hybrid-merge.js`, `scripts/`.

## Tests
(Congelados en `tests/semantic-collection-lock.test.js`, incluida la detección de doble
escritor y el robo de lock stale. La suite completa debe seguir verde: es regresión — las
aperturas sin `lockPath` no deben cambiar.)

## Constraints
- PARAR y reportar si... conectar el lock exigiera cambiar el comportamiento de `openDurable`
  sin `lockPath` o romper los tests de durabilidad existentes; documentar el porqué y responder BLOQUEADO.
