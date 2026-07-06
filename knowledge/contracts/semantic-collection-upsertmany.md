---
type: 'Task Contract'
title: 'Inserción batch en SemanticCollection (upsertMany)'
description: 'Añade upsertMany(items) que inserta/actualiza una lista de registros reusando upsert, devolviendo los ids en orden.'
tags: ['js-store', 'ccdd', 'semantic', 'crud', 'batch']

task: semantic-collection-upsertmany
intent: "Insertar en lote una lista de registros reusando upsert."
target: src/semantic-collection.js
signature: "upsertMany(items)"
language: javascript
test_command: "node --test tests/semantic-collection-upsertmany.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/semantic-collection-upsertmany.test.js
deps_allowed: []
forbids: ['network', 'subprocess', 'filesystem']
---

# Contract: semantic-collection-upsertmany

## Intent
Comodidad batch para [`SemanticCollection`](../../src/semantic-collection.js): insertar o
actualizar varios registros en una llamada, reusando `upsert`. Cambio ADITIVO: el resto de
métodos NO cambia.

## Interface
```js
sc.upsertMany(items) -> Array<id>
//   items: Array<{ id, doc, vector }>. Por cada item llama this.upsert(item.id, item.doc,
//   item.vector), en orden. Devuelve el array de ids resultantes, en el mismo orden.
```

## Invariants
- Procesa `items` en orden, delegando cada uno en `upsert` (misma semántica: idempotente por
  id, escribe doc + vector, doc con `_id = id`).
- Devuelve el array de ids (lo que devuelve cada `upsert`), en el orden de `items`.
- `items` vacío => `[]`, sin cambiar el estado.
- Id duplicado dentro del batch: gana el último (consecuencia de `upsert`).
- Ids ya existentes se actualizan (idempotente por id).
- Zero-dependencias; sin IO propio; reusa `upsert` (no reimplementa la escritura).

## Examples
- upsertMany([{id:"a",doc:{},vector:[1,0,0]},{id:"b",doc:{},vector:[0,1,0]}]) -> ["a","b"].
- upsertMany([]) -> [].
- Dos items con id "a" -> queda 1 doc, el del segundo item.

## Do / Don't
- DO: `return items.map((it) => this.upsert(it.id, it.doc, it.vector));` (o equivalente en orden).
- DON'T: reimplementar la escritura en los stores; reordenar; deduplicar antes de tiempo.
- DON'T: tocar `tests/`, `knowledge/`, `src/vendor/`, `src/hybrid-merge.js`, `scripts/`.

## Tests
(Congelados en `tests/semantic-collection-upsertmany.test.js`. La suite completa debe seguir
verde: es regresión.)

## Constraints
- PARAR y reportar si... reusar `upsert` en lote fuera imposible o exigiera cambiar `upsert`;
  documentar el porqué y responder BLOQUEADO.
