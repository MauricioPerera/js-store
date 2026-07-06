---
type: 'Task Contract'
title: 'Validación de entrada en upsert'
description: 'upsert valida id/doc/vector con validateInput y lanza si hay violaciones, antes de tocar los stores (sin escritura parcial).'
tags: ['js-store', 'ccdd', 'semantic', 'validacion']

task: semantic-collection-validate
intent: "Rechazar en upsert las entradas que no cumplen el modelo de datos."
target: src/semantic-collection.js
signature: "upsert(id, doc, vector)"
language: javascript
test_command: "node --test tests/semantic-collection-validate.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/semantic-collection-validate.test.js
deps_allowed: []
forbids: ['network', 'subprocess', 'filesystem']
---

# Contract: semantic-collection-validate

## Intent
Conecta el validador [`validateInput`](../../src/validate.js) a
[`SemanticCollection`](../../src/semantic-collection.js): `upsert` valida `id`/`doc`/`vector`
contra el `dim` de la colección y **lanza** si hay violaciones, **antes** de escribir en los
cores (un rechazo no deja estado parcial). Cambio ADITIVO: solo se añade la validación al
inicio de `upsert`; el resto de la lógica y de los métodos NO cambia.

## Interface
```js
upsert(id, doc, vector) -> id            // válido: idéntico a hoy
upsert(<inválido>)      -> throws Error  // con las violaciones de validateInput en el mensaje
//   Al inicio: const errors = validateInput(id, doc, vector, this.vectorStore.dim);
//   if (errors.length) throw new Error(<incluye errors.join(...)>);  // ANTES de tocar los stores.
```

## Invariants
- `upsert` llama a `validateInput(id, doc, vector, this.vectorStore.dim)` como **primer paso**;
  si devuelve violaciones, lanza un `Error` cuyo mensaje **incluye** esas violaciones (que
  nombran el campo: id / doc / vector).
- El throw ocurre **antes** de `vectorStore.set`/`docCollection`/`_record`: un upsert rechazado
  **no modifica el estado** (count y get quedan como antes de la llamada).
- `upsert` con entrada válida se comporta EXACTAMENTE como hoy (devuelve id, escribe, journaliza).
- `upsertMany` (que reusa `upsert`) lanza si algún item es inválido.
- Reusa `validateInput` (no reimplementa las reglas). Solo stdlib.

## Examples
- upsert("", {}, [1,0,0]) -> throws (mensaje contiene "id").
- upsert("a", {}, [1,0]) con dim 3 -> throws (contiene "vector"); count sigue 0.
- upsert("a", {tipo:"post"}, [1,0,0]) -> "a" (válido, sin cambios).

## Do / Don't
- DO: `const { validateInput } = require("./validate.js");` y validar al inicio de `upsert`,
  lanzando antes de cualquier escritura en los stores.
- DON'T: validar después de escribir; reimplementar las reglas; cambiar otros métodos ni el
  comportamiento con entrada válida.
- DON'T: tocar `tests/`, `knowledge/`, `src/vendor/`, `src/validate.js`, `src/wal.js`,
  `src/lock.js`, `src/hybrid-merge.js`, `scripts/`.

## Tests
(Congelados en `tests/semantic-collection-validate.test.js`, incluida la comprobación de que
un rechazo no deja estado parcial. La suite completa debe seguir verde: es regresión — todos
los upsert existentes usan entrada válida.)

## Constraints
- PARAR y reportar si... validar antes de escribir rompiera algún test existente (indicaría
  que dependía de entrada inválida); documentar el porqué y responder BLOQUEADO.
