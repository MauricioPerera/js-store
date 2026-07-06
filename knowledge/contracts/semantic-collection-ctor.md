---
type: 'Task Contract'
title: 'Constructor de conveniencia de SemanticCollection'
description: 'Extiende el constructor de SemanticCollection para armar cores propios en memoria cuando no se inyectan, conservando el modo inyección existente.'
tags: ['js-store', 'ccdd', 'semantic', 'constructor']

task: semantic-collection-ctor
intent: "Construir cores propios en memoria en el constructor cuando no se inyectan dependencias."
target: src/semantic-collection.js
signature: "SemanticCollection(opts)"
language: javascript
test_command: "node --test tests/semantic-collection-ctor.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/semantic-collection-ctor.test.js
deps_allowed: []
forbids: ['network', 'subprocess', 'filesystem']
---

# Contract: semantic-collection-ctor

## Intent
Cambio ADITIVO al constructor de [`SemanticCollection`](../../src/semantic-collection.js):
hoy exige inyectar `vectorStore` y `docCollection`; esta tarea añade un modo de
**conveniencia** que arma sus propios cores en memoria a partir de `dim`, para que la clase
sea usable sin fricción. El modo inyección existente NO cambia.

## Interface
```js
new SemanticCollection(opts = {})
// Modo INYECCIÓN (existente, sin cambios): si opts.vectorStore != null =>
//   usa opts.vectorStore, opts.docCollection; col = opts.col ?? "default".
// Modo CONVENIENCIA (nuevo): si NO se inyecta vectorStore =>
//   dim = opts.dim ?? 768; col = opts.col ?? "default";
//   crea internamente un VectorStore (MemoryStorageAdapter, dim) y una Collection
//   de un DocStore (MemoryStorageAdapter) con nombre `col`.
```

## Invariants
- El discriminador es `opts.vectorStore`: presente => inyección; ausente => conveniencia.
- En conveniencia, los cores se crean con los adaptadores en memoria de los cores
  vendorizados (`VectorStore`, `MemoryStorageAdapter`, `DocStore` de `src/vendor/`).
- `upsert` y `search` operan idénticamente en ambos modos (la lógica de esos métodos NO cambia).
- Dos instancias de conveniencia son independientes: no comparten estado.
- `dim` por defecto 768; `col` por defecto "default".
- Zero-dependencias; sin IO propio (los adaptadores en memoria no tocan disco); no muta `opts`.

## Examples
- `new SemanticCollection({ dim: 3 })` -> instancia usable: upsert/search operan.
- `new SemanticCollection({ vectorStore, docCollection, col })` -> usa los inyectados (regresión).
- Dos `new SemanticCollection({ dim: 3 })` -> estados separados.

## Do / Don't
- DO: ramificar el constructor por presencia de `opts.vectorStore`; requerir los cores del vendor.
- DO: mantener `upsert`/`search` intactos (solo cambia el constructor).
- DON'T: romper el modo inyección ni los tests congelados de `semantic-collection.md`.
- DON'T: tocar `tests/`, `knowledge/`, `src/vendor/`, `src/hybrid-merge.js`, `scripts/`.

## Tests
(Congelados en `tests/semantic-collection-ctor.test.js`. Además, la suite completa —incluidos
`tests/semantic-collection.test.js` (10) y la fachada— debe seguir verde: es regresión.)

## Constraints
- PARAR y reportar si... cumplir el modo conveniencia obligara a cambiar la firma o el
  comportamiento del modo inyección existente; documentar el porqué y responder BLOQUEADO.
