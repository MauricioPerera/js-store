---
type: 'Task Contract'
title: 'Lista de ids de SemanticCollection (keys)'
description: 'keys() devuelve el array de ids (_id) de todos los documentos de la colección.'
tags: ['js-store', 'ccdd', 'semantic', 'crud', 'ab-test']

task: semantic-collection-keys
intent: "Listar los ids de todos los documentos de la coleccion."
target: src/semantic-collection.js
signature: "keys()"
language: javascript
test_command: "node --test tests/semantic-collection-keys.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/semantic-collection-keys.test.js
deps_allowed: []
forbids: ['network', 'subprocess', 'filesystem']
---

# Contract: semantic-collection-keys

## Intent
Task del A/B v1(GLM) vs v2(nativo): añade `keys()` a
[`SemanticCollection`](../../src/semantic-collection.js), que devuelve el array de ids
(`_id`) de todos los documentos. Cambio ADITIVO; delega en el core documental.

## Interface
```js
sc.keys() -> string[]
//   Devuelve los _id de todos los docs (uno por doc, sin duplicados). Delega en
//   this.docCollection.export().map((d) => d._id). Lectura pura: no muta estado.
```

## Invariants
- Devuelve un id por documento existente; sin duplicados.
- Colección vacía => `[]`.
- Refleja el estado actual: tras `delete(id)`, ese id NO aparece.
- Los elementos son los `_id` (strings).
- Lectura pura: no muta el estado.
- Zero-dependencias; sin IO propio.

## Examples
- vacía -> keys() = [].
- upsert("a",..); upsert("b",..); keys() (ordenado) = ["a","b"].
- tras delete("a") -> keys() = ["b"].

## Do / Don't
- DO: `return this.docCollection.export().map((d) => d._id);`
- DON'T: reimplementar el almacenamiento; mutar estado; tocar otros métodos.
- DON'T: tocar `tests/`, `knowledge/`, `src/vendor/`, `scripts/`.

## Tests
(Congelados en `tests/semantic-collection-keys.test.js`. La suite completa debe seguir verde.)

## Constraints
- PARAR y reportar si... el core documental no ofreciera una forma de listar los docs;
  documentar el porqué y responder BLOQUEADO.
