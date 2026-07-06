---
type: 'Task Contract'
title: 'Transacciones en SemanticCollection (begin/commit/rollback)'
description: 'Transacciones atómicas: begin captura un snapshot en memoria y difiere el journaling; commit vuelca el buffer al WAL; rollback restaura desde el snapshot.'
tags: ['js-store', 'ccdd', 'semantic', 'durabilidad', 'transacciones']

task: semantic-collection-tx
intent: "Aplicar mutaciones dentro de una transaccion atomica con rollback."
target: src/semantic-collection.js
signature: "begin()"
language: javascript
test_command: "node --test tests/semantic-collection-tx.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/semantic-collection-tx.test.js
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: semantic-collection-tx

## Intent
Fase C de durabilidad: transacciones atómicas sobre
[`SemanticCollection`](../../src/semantic-collection.js). Como los cores no exponen rollback,
se usa **snapshot en memoria** (Strategy 2): `begin` guarda el estado; las mutaciones se
aplican al vuelo (read-your-writes) pero su journaling se **difiere** a un buffer; `commit`
vuelca el buffer al WAL; `rollback` restaura desde el snapshot y descarta el buffer. Cambio
ADITIVO: implementa `begin`/`commit`/`rollback` (stubs) y refactoriza el journaling de
`upsert`/`delete` a un helper `_record` sin cambiar su comportamiento observable sin tx.

## Interface
```js
sc.begin()    // inicia tx: this._tx = { snapshot: this.serialize(), ops: [] }. Lanza si ya hay tx.
sc.commit()   // si walPath, anexa todas las ops del buffer al WAL; cierra la tx. Lanza sin tx.
sc.rollback() // restaura los stores desde this._tx.snapshot; descarta el buffer. Lanza sin tx.
```

## Invariants
- El constructor inicializa `this._tx = null`.
- Journaling refactorizado a `_record(op)`: si `this._tx` => `this._tx.ops.push(op)`; si no y
  `this.walPath` => `appendOp(this.walPath, op)`. `upsert`/`delete` llaman a `_record` en lugar
  de `appendOp` directo. **Comportamiento observable sin tx idéntico al actual** (regresión).
- **Atomicidad**: dentro de una tx, `upsert`/`delete` SÍ aplican a los stores en memoria
  (read-your-writes: `get`/`search` ven los cambios), pero NO anexan al WAL hasta `commit`.
- `rollback` deja el estado EXACTO previo a `begin` (upserts deshechos, deletes revertidos,
  valores restaurados), reconstruyendo los stores desde el snapshot (vía `deserialize`).
- `commit` con `walPath` anexa las ops bufferizadas al WAL en orden; sin `walPath` solo cierra.
- **Alcance de la atomicidad de `commit`**: es atómico **en memoria** y **frente a `rollback`**, NO
  frente a un crash a mitad del volcado al WAL. El WAL no tiene marcadores begin/commit, así que un
  crash entre el append de dos ops deja un prefijo de la tx que `openDurable` replaya (media
  transacción). Un `checkpoint()` tras el commit acota la ventana.
- Tras `rollback`, el WAL NO contiene las ops de la tx descartada; `openDurable` reconstruye
  sin ellas.
- Errores: `begin` estando en tx lanza (no anidamiento); `commit`/`rollback` sin tx lanzan.
- **Modo disco**: `begin` lanza si `this._diskVecPath != null` (modo disco, constructor con
  `{ path }`). Las tx son del modo memoria: en disco un upsert dentro de la tx hace fsync
  directo al log y `rollback` restaura cores en memoria sin tocar `_diskVecPath` -> estado
  divergente + la op persiste al reabrir. `openDurable` NO activa modo disco (`_diskVecPath`
  queda null: memoria + WAL), así que sus tx siguen permitidas. `commit`/`rollback` quedan
  protegidos por transitividad (no se puede activar la tx en disco).
- Reusa `serialize`/`deserialize`/`appendOp`; no reimplementa nada. Solo stdlib.

## Examples
- begin; upsert a; rollback -> a ausente. begin; upsert a; commit -> a presente.
- durable: begin; upsert a; commit -> WAL:[a]. begin; upsert b; rollback -> WAL sigue [a], b ausente.

## Do / Don't
- DO: en `rollback`, reconstruir los stores desde el snapshot (p.ej. `const r =
  SemanticCollection.deserialize(this._tx.snapshot); this.vectorStore = r.vectorStore;
  this.docCollection = r.docCollection;`) y `this._tx = null`.
- DO: en `commit`, si `this.walPath`, `for (const op of this._tx.ops) appendOp(this.walPath, op);` y `this._tx = null`.
- DON'T: journalizar durante la tx (diferido al commit); permitir anidamiento; cambiar el
  comportamiento sin tx; reimplementar serialize/append.
- DON'T: tocar `tests/`, `knowledge/`, `src/vendor/`, `src/wal.js`, `src/hybrid-merge.js`, `scripts/`.

## Tests
(Congelados en `tests/semantic-collection-tx.test.js`: rollback deshace, commit persiste,
read-your-writes, tx+WAL atómico, recuperación tras rollback, errores. La suite completa debe
seguir verde: es regresión — el journaling sin tx no debe cambiar.)

## Constraints
- PARAR y reportar si... el rollback atómico no fuera posible reconstruyendo desde el snapshot
  o exigiera cambiar el comportamiento sin tx; documentar el porqué y responder BLOQUEADO.
