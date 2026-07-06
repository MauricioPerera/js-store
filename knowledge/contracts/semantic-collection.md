---
type: 'Task Contract'
title: 'Colección semántica doc+vector'
description: 'Clase de integración que une un core documental y uno vectorial: upsert de documento+embedding y búsqueda semántica filtrada por query documental.'
tags: ['js-store', 'ccdd', 'semantic', 'integracion']

task: semantic-collection
intent: "Unir en una coleccion semantica el core documental con el vectorial."
target: src/semantic-collection.js
signature: "search(queryVector, options)"
language: javascript
test_command: "node --test tests/semantic-collection.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/semantic-collection.test.js
deps_allowed: []
forbids: ['network', 'subprocess', 'filesystem']
---

# Contract: semantic-collection

## Intent
Pieza de integración de js-store: una `SemanticCollection` que envuelve un
[core documental](../../src/vendor/js-doc-store.js) y uno
[vectorial](../../src/vendor/js-vector-store.js) (inyectados) y expone `upsert` + `search`,
usando [`hybridMerge`](../../src/hybrid-merge.js) para fusionar. Anclada al modelo
[Documento y vector](../data_models/documents.md).

## Interface
```js
// Inyección de dependencias (cores vendorizados ya construidos):
new SemanticCollection({ vectorStore, docCollection, col })
//   vectorStore:   instancia de VectorStore del core vectorial.
//   docCollection: instancia de Collection del core documental (db.collection(name)).
//   col:           nombre de colección del vector store (default "default").

upsert(id, doc, vector) -> id
//   set(col,id,vector) en el vector store; en docCollection reemplaza el doc con _id=id
//   (upsert: si existía, se actualiza; no duplica). Devuelve id.

search(queryVector, options = {}) -> Array<{ id, score, doc }>
//   options.filter:   filtro estilo Mongo del core documental (default null = sin filtro).
//   options.limit:    máximo de resultados (default 5).
//   options.overFetch: candidatos a pedir al vector store (default suficiente para no
//                      perder recall tras filtrar; p.ej. max(limit*10, 100)).
```

## Invariants
- `search` pide al vector store MÁS candidatos que `limit` (over-fetch) y filtra DESPUÉS,
  de modo que documentos filtrados en el top no reduzcan el recall. Nunca pide solo `limit`.
- El filtro documental se aplica por `_id` sobre los candidatos: un candidato pasa si su
  documento existe y matchea `filter` (sin filtro => pasa todo candidato con doc).
- El ranking preserva el orden por similitud del vector store (vía `hybridMerge`); el
  truncado a `limit` es DESPUÉS de filtrar.
- Cada resultado es `{ id, score, doc }` con el documento adjunto (por `_id`).
- `upsert` es idempotente por `id`: reinsertar el mismo `id` actualiza doc y vector, no duplica.
- Zero-dependencias; sin IO propio (usa solo los cores inyectados y stdlib); no muta `options`.
- La unión doc↔vector es por identidad: el `id` del vector == el `_id` del documento.

## Examples
- upsert("a",{tipo:"post"},[1,0,0]); search([1,0,0]) -> [{id:"a",score:1,doc:{_id:"a",tipo:"post"}}].
- Con docs a(post),b(note): search([1,0,0],{filter:{tipo:"post"}}) excluye b.
- limit:1 sobre candidatos filtrados -> 1 resultado, el de mayor similitud que pasa el filtro.

## Do / Don't
- DO: over-fetch del vector store, filtrar por doc, fusionar con `hybridMerge`, adjuntar doc.
- DO: extraer helpers pequeños si una función excede el budget (cada método <= budget).
- DON'T: reordenar por fuera de la similitud, deduplicar, pedir solo `limit` al vector store.
- DON'T: red, subprocess, IO de archivos, dependencias fuera de stdlib y los cores inyectados.
- DON'T: tocar `tests/`, `knowledge/`, `src/vendor/`, `src/hybrid-merge.js`, `scripts/`.

## Tests
(Congelados en `tests/semantic-collection.test.js`, autorados por el PM ANTES de la
delegación: construyen los cores reales en memoria; el implementador no los edita.)

## Constraints
- PARAR y reportar si... los tests congelados se contradijeran con la API real de los cores
  vendorizados o exigieran algo imposible; documentar el porqué y responder BLOQUEADO.
