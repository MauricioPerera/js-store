---
type: 'Task Contract'
title: 'Lecturas directas en SemanticCollection (get/count)'
description: 'Añade get(id) que devuelve el documento por id y count(filter) que cuenta documentos, opcionalmente por filtro Mongo.'
tags: ['js-store', 'ccdd', 'semantic', 'crud']

task: semantic-collection-reads
intent: "Delegar en el core documental las lecturas directas del CRUD."
target: src/semantic-collection.js
signature: "get(id)"
language: javascript
test_command: "node --test tests/semantic-collection-reads.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/semantic-collection-reads.test.js
deps_allowed: []
forbids: ['network', 'subprocess', 'filesystem']
---

# Contract: semantic-collection-reads

## Intent
Completa las lecturas del CRUD de [`SemanticCollection`](../../src/semantic-collection.js):
hoy hay upsert/search/delete pero faltan la lectura directa por id y el conteo. Cambio
ADITIVO: el resto de métodos NO cambia. Delega en el core documental.

## Interface
```js
sc.get(id) -> object | null
//   Devuelve el documento almacenado (con _id) o null si no existe.
//   Delega en this.docCollection.findById(id).

sc.count(filter) -> number
//   Número de documentos que matchean `filter` (filtro Mongo). Sin filtro => total.
//   Delega en this.docCollection.count(filter).
```

## Invariants
- `get(id)` devuelve el doc (tal como lo devuelve `docCollection.findById`, incluye `_id`) o
  `null` si el id no existe. No lanza.
- `count()` sin argumento devuelve el total de documentos; `count(filter)` devuelve los que
  matchean el filtro Mongo (0 si ninguno).
- Ambos reflejan el estado actual: tras `delete(id)`, `get(id)` es null y `count` decrementa.
- Lecturas puras: no mutan estado; delegan en el core documental (`findById`/`count`).
- Zero-dependencias; sin IO propio.

## Examples
- upsert("a",{tipo:"post"},..); get("a") -> { tipo:"post", _id:"a", ... }.
- get("inexistente") -> null.
- count() -> total; count({ tipo:"post" }) -> nº de posts.

## Do / Don't
- DO: `get` -> `this.docCollection.findById(id)`; `count` -> `this.docCollection.count(filter)`.
- DON'T: reimplementar el filtrado/conteo; mutar estado; tocar otros métodos.
- DON'T: tocar `tests/`, `knowledge/`, `src/vendor/`, `src/hybrid-merge.js`, `scripts/`.

## Tests
(Congelados en `tests/semantic-collection-reads.test.js`. La suite completa debe seguir
verde: es regresión.)

## Constraints
- PARAR y reportar si... la API real del core documental no ofreciera `findById`/`count` con
  esta semántica; documentar el porqué y responder BLOQUEADO.
