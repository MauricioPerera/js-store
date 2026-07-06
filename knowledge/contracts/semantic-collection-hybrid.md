---
type: 'Task Contract'
title: 'Búsqueda híbrida texto+vector en SemanticCollection'
description: 'Añade searchHybrid() que fusiona similitud vectorial con relevancia textual BM25 y aplica el filtro documental.'
tags: ['js-store', 'ccdd', 'semantic', 'hybrid', 'bm25']

task: semantic-collection-hybrid
intent: "Buscar fusionando similitud vectorial con relevancia textual BM25."
target: src/semantic-collection.js
signature: "searchHybrid(queryVector, queryText, options)"
language: javascript
test_command: "node --test tests/semantic-collection-hybrid.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/semantic-collection-hybrid.test.js
deps_allowed: []
forbids: ['network', 'subprocess', 'filesystem']
---

# Contract: semantic-collection-hybrid

## Intent
Añade a [`SemanticCollection`](../../src/semantic-collection.js) una búsqueda **híbrida**:
fusiona el ranking por similitud vectorial con la relevancia textual **BM25** (vía el
`HybridSearch` del core vectorial) y aplica el filtro documental. Cambio ADITIVO:
constructor/upsert/search/delete/serialize/deserialize NO cambian. El índice BM25 se
construye **al vuelo** desde los documentos (rebuild-at-query), sin mantener estado extra.

## Interface
```js
sc.searchHybrid(queryVector, queryText, options = {}) -> Array<{ id, score, doc }>
//   options.filter:    filtro Mongo del core documental (default null).
//   options.limit:     máximo de resultados (default 5).
//   options.textField: campo del doc a indexar en BM25 (default "text").
//   options.mode:      "rrf" (default) | "weighted" (pasa a HybridSearch).
//   options.vectorWeight / textWeight / rrfK / fetchK / metric: pass-through a HybridSearch.search.
```

## Invariants
- Construye un `BM25Index` (del core vendorizado) al vuelo: por cada doc de
  `docCollection.export()`, `bm25.addDocument(col, doc._id, String(doc[textField] ?? ""))`.
- Fusiona con `new HybridSearch(vectorStore, bm25, mode).search(col, queryVector, queryText,
  overFetch, options)` — over-fetch (> limit) para no perder recall tras filtrar.
- Aplica el filtro documental por `_id` sobre los candidatos (mismo criterio que `search`),
  fusiona con `hybridMerge` y trunca a `limit` DESPUÉS de filtrar.
- Cada resultado es `{ id, score, doc }` con el doc adjunto por `_id`.
- Saneo post-crash: un vector huerfano (sin doc) se EXCLUYE del resultado (`doc == null`
  no se devuelve), igual que `search`. En operacion normal es identico.
- Modo `weighted` con `vectorWeight: 0` => domina BM25; con `textWeight: 0` => domina el vector.
- Zero-dependencias (solo cores vendorizados + stdlib); sin IO propio; no muta `options`.

## Examples
- searchHybrid([1,0,0], "beta", {mode:"weighted", vectorWeight:0, textWeight:1, limit:1}) ->
  el doc cuyo texto matchea "beta" (aunque su vector sea disímil).
- searchHybrid(q, "beta", {filter:{tipo:"post"}}) -> excluye los que no matchean el filtro.

## Do / Don't
- DO: reusar `buildAllowedIds` (filtro) y `hybridMerge` (fusión/truncado) ya existentes.
- DO: extraer un helper para construir el BM25 si el método excede el budget.
- DON'T: mantener el BM25 en el estado (se reconstruye por consulta); reimplementar la fusión
  RRF/weighted (usar `HybridSearch`); cambiar otros métodos.
- DON'T: tocar `tests/`, `knowledge/`, `src/vendor/`, `src/hybrid-merge.js`, `scripts/`.

## Tests
(Congelados en `tests/semantic-collection-hybrid.test.js`. La suite completa debe seguir
verde: es regresión.)

## Constraints
- PARAR y reportar si... la API real de `BM25Index`/`HybridSearch` no permitiera esta fusión
  o exigiera cambiar otros métodos; documentar el porqué y responder BLOQUEADO.
