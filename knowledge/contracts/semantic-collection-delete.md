---
type: 'Task Contract'
title: 'Borrado en SemanticCollection'
description: 'Añade delete(id) a SemanticCollection que elimina el documento y su vector de ambos cores, idempotente.'
tags: ['js-store', 'ccdd', 'semantic', 'crud']

task: semantic-collection-delete
intent: "Eliminar por id el registro de ambos cores."
target: src/semantic-collection.js
signature: "delete(id)"
language: javascript
test_command: "node --test tests/semantic-collection-delete.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/semantic-collection-delete.test.js
deps_allowed: []
forbids: ['network', 'subprocess', 'filesystem']
---

# Contract: semantic-collection-delete

## Intent
Cierra el CRUD de [`SemanticCollection`](../../src/semantic-collection.js): hoy hay `upsert`
y `search` pero falta el borrado. `delete(id)` quita el documento y su vector de los dos
cores. Cambio ADITIVO: constructor/upsert/search/serialize/deserialize NO cambian.

## Interface
```js
sc.delete(id) -> boolean
//   Elimina el vector (vectorStore.remove(col, id)) y el documento
//   (docCollection.remove({ _id: id })). Devuelve true si el documento existía
//   (fue removido), false si no. Idempotente: nunca lanza ante id inexistente.
```

## Invariants
- Quita de AMBOS stores: `this.vectorStore.remove(this.col, id)` y
  `this.docCollection.remove({ _id: id })`.
- Retorno: `true` si el documento existía antes (el count de `docCollection.remove` > 0),
  `false` si no. (`docCollection.remove` devuelve el número de docs removidos; nunca lanza.)
- Idempotente: `delete` de un id inexistente devuelve `false` y no lanza.
- Tras `delete(id)`: `search` no devuelve ese id y `docCollection.findById(id)` es null.
- No corrompe estado: re-`upsert` del mismo id tras `delete` vuelve a insertarlo limpio.
- No afecta a otros ids.
- Zero-dependencias; sin IO propio; no muta argumentos.

## Examples
- upsert("a",..); delete("a") -> true; search ya no incluye "a".
- delete("inexistente") -> false (sin lanzar).
- delete("a"); serialize() -> el round-trip no contiene "a".

## Do / Don't
- DO: remover de vector y doc; derivar el boolean del count de `docCollection.remove`.
- DON'T: lanzar ante id inexistente; reimplementar upsert/search; tocar otros métodos.
- DON'T: tocar `tests/`, `knowledge/`, `src/vendor/`, `src/hybrid-merge.js`, `scripts/`.

## Tests
(Congelados en `tests/semantic-collection-delete.test.js`. La suite completa debe seguir
verde: es regresión.)

## Constraints
- PARAR y reportar si... la API real de los cores no permitiera un borrado idempotente sin
  lanzar; documentar el porqué y responder BLOQUEADO.
