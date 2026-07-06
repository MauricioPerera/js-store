---
type: 'Task Contract'
title: 'Journaling opt-in en SemanticCollection (WAL)'
description: 'Con un walPath opcional, upsert y delete anexan su operación al WAL (src/wal.js); sin walPath el comportamiento no cambia.'
tags: ['js-store', 'ccdd', 'semantic', 'durabilidad', 'wal']

task: semantic-collection-journal
intent: "Anexar al WAL cada mutacion cuando el journaling esta activo."
target: src/semantic-collection.js
signature: "upsert(id, doc, vector)"
language: javascript
test_command: "node --test tests/semantic-collection-journal.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/semantic-collection-journal.test.js
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: semantic-collection-journal

## Intent
Fase B2a de durabilidad: conectar el [módulo WAL](../../src/wal.js) a
[`SemanticCollection`](../../src/semantic-collection.js). Con un `walPath` **opcional** en el
constructor, cada `upsert`/`delete` anexa su operación al journal; **sin** `walPath` el
comportamiento es idéntico al actual (opt-in). Cambio ADITIVO.

## Interface
```js
new SemanticCollection({ ...opts, walPath })
//   walPath opcional. Si se pasa, la colección journaliza cada mutación en ese archivo WAL.
//   Guarda this.walPath = walPath ?? null.

// upsert/delete, cuando this.walPath != null, tras aplicar en memoria anexan al WAL con
// appendOp(this.walPath, op) del módulo src/wal.js:
//   upsert(id, doc, vector) -> op: { op: "upsert", id, doc, vector }
//   delete(id)              -> op: { op: "delete", id }
```

## Invariants
- Con `walPath`: `upsert` anexa `{ op:"upsert", id, doc, vector }` DESPUÉS de escribir en los
  stores; `delete` anexa `{ op:"delete", id }` DESPUÉS de aplicar el borrado. Orden = orden de
  llamada. `upsertMany` anexa una op por item (reusa `upsert`, sin cambios).
- Sin `walPath` (default): NO se crea archivo WAL ni se anexa nada; comportamiento y valores
  de retorno de `upsert`/`delete` idénticos a hoy.
- Las ops registradas bastan para reconstruir el estado por replay (upsert/delete en orden).
- `upsert`/`delete` conservan su retorno actual (id / boolean).
- Usa `appendOp` de `src/wal.js` (no reimplementa el journal). Solo stdlib; sin red/subprocess.

## Examples
- new SemanticCollection({dim:3, walPath:w}); upsert("a",{n:1},[1,0,0]) -> WAL: [{op:"upsert",id:"a",doc:{n:1},vector:[1,0,0]}].
- Sin walPath: upsert no crea ningún archivo.

## Do / Don't
- DO: `const { appendOp } = require("./wal.js");` y anexar tras aplicar, guardado por `if (this.walPath)`.
- DO: añadir `walPath` al destructuring del constructor y `this.walPath`.
- DON'T: journalizar cuando `walPath` es null; cambiar los retornos ni la lógica de stores;
  reimplementar el append.
- DON'T: tocar `tests/`, `knowledge/`, `src/vendor/`, `src/wal.js`, `src/hybrid-merge.js`, `scripts/`.

## Tests
(Congelados en `tests/semantic-collection-journal.test.js`. La suite completa debe seguir
verde: es regresión — las colecciones sin `walPath` no deben cambiar.)

## Constraints
- PARAR y reportar si... conectar el WAL exigiera cambiar la firma de `upsert`/`delete` o
  romper el modo sin journaling; documentar el porqué y responder BLOQUEADO.
