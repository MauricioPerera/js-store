---
type: 'Task Contract'
title: 'Fusión híbrida de resultados doc+vector'
description: 'Función pura que filtra los hits vectoriales ordenados por el conjunto de ids permitidos por el filtro documental y trunca al límite, preservando el orden.'
tags: ['js-store', 'ccdd', 'hybrid', 'integracion']

task: hybrid-merge
intent: "Fusionar el ranking vectorial con el conjunto de ids permitidos por el filtro documental."
target: src/hybrid-merge.js
signature: "function hybridMerge(vectorHits, allowedIds, limit)"
language: javascript
test_command: "node --test tests/hybrid-merge.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/hybrid-merge.test.js
deps_allowed: []
forbids: ['network', 'subprocess', 'filesystem']
---

# Contract: hybrid-merge

## Intent
Primitiva de integración de js-store: dado el ranking por similitud del
[core vectorial](../../src/vendor/js-vector-store.js) y el conjunto de ids que pasan el
filtro del [core documental](../../src/vendor/js-doc-store.js), producir la lista final de
hits. Anclada al modelo [Documento y vector](../data_models/documents.md). Función **pura**:
la búsqueda semántica combinada se construirá encima de esta pieza.

## Interface
```js
function hybridMerge(vectorHits, allowedIds, limit)
// vectorHits: array de objetos hit { id, score }, YA ordenados por relevancia (no se reordena).
// allowedIds: Set | array de ids permitidos, o null/undefined = sin filtro (todos pasan).
// limit:      número finito >= 0 = máximo de resultados; no finito/ausente = sin límite.
// return:     array NUEVO con los hits (mismas referencias) cuyo id está permitido,
//             en el orden original, truncado al límite.
```

## Invariants
- Preserva el **orden de entrada** de `vectorHits` (no reordena por score ni por nada).
- `allowedIds` null/undefined => no filtra. Set/array vacío => resultado vacío. La pertenencia
  usa igualdad SameValueZero (Set nativo; para array, equivalente a `includes`).
- `limit`: si es número finito, se toma `max(0, floor(limit))` (0 y negativos => `[]`);
  si no es finito o está ausente => sin límite. El truncado es **después** de filtrar.
- **Pura**: no muta `vectorHits`, `allowedIds` ni los objetos hit; devuelve un array nuevo;
  conserva las **referencias** de los objetos hit (no los clona).
- **Total**: nunca lanza ante input arbitrario; `vectorHits` que no es array => `[]`.
- Ids duplicados en `vectorHits` se **conservan** (no hay dedupe).
- Determinista, stdlib pura, sin IO/red/subprocess.

## Examples
- `hybridMerge([{id:"a",score:.9},{id:"b",score:.8}], new Set(["a"]))` -> `[{id:"a",score:.9}]`.
- `hybridMerge([{id:"a"},{id:"b"},{id:"c"}], null, 2)` -> `[{id:"a"},{id:"b"}]`.
- `hybridMerge([{id:"a"},{id:"b"}], new Set(), 5)` -> `[]`.
- `hybridMerge(null, ["a"])` -> `[]`.

## Do / Don't
- DO: recorrer `vectorHits` una vez, en orden, incluyendo el hit si su id está permitido.
- DO: normalizar `allowedIds` (Set/array/null) a una prueba de pertenencia una sola vez.
- DON'T: reordenar, deduplicar, clonar los hits, ni mutar ninguna entrada.
- DON'T: red, subprocess, IO de archivos, dependencias fuera de stdlib.
- DON'T: tocar `tests/`, `knowledge/`, `src/vendor/`, `scripts/` — el oráculo está congelado.

## Tests
(Congelados en `tests/hybrid-merge.test.js`, autorados por el PM ANTES de la delegación:
el implementador no los escribe ni los modifica.)

## Constraints
- PARAR y reportar si... los tests congelados se contradijeran entre sí o exigieran algo
  imposible con JavaScript stdlib puro; documentar el porqué y responder BLOQUEADO.
