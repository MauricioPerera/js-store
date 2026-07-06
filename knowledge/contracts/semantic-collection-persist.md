---
type: 'Task Contract'
title: 'Persistencia de SemanticCollection (round-trip JSON)'
description: 'Añade serialize()/deserialize() a SemanticCollection para volcarla a un objeto plano JSON y reconstruirla, preservando búsqueda, filtro y estado.'
tags: ['js-store', 'ccdd', 'semantic', 'persistencia']

task: semantic-collection-persist
intent: "Serializar SemanticCollection a un objeto plano JSON reconstruible."
target: src/semantic-collection.js
signature: "serialize()"
language: javascript
test_command: "node --test tests/semantic-collection-persist.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/semantic-collection-persist.test.js
deps_allowed: []
forbids: ['network', 'subprocess', 'filesystem']
---

# Contract: semantic-collection-persist

## Intent
Persistencia portable de [`SemanticCollection`](../../src/semantic-collection.js): un
`serialize()` que devuelve un **objeto plano JSON** (sin binario) y un
`static deserialize(data)` que reconstruye la colección. El consumidor decide dónde
guardarlo (disco, red); la clase no hace IO propio. Cambio ADITIVO: `upsert`/`search`/
constructor NO cambian.

## Interface
```js
sc.serialize() -> { col, dim, records: Array<{ id, doc, vector }> }
//   col:  nombre de colección; dim: dimensión del vector store; records: un item por doc.
//   Debe ser JSON-serializable (JSON.parse(JSON.stringify(x)) === x, sin ArrayBuffer).

SemanticCollection.deserialize(data) -> SemanticCollection
//   Reconstruye una colección de CONVENIENCIA con data.dim/data.col y reinserta cada record.
```

## Invariants
- Round-trip: `deserialize(sc.serialize())` produce una colección cuyo `search` (ranking,
  doc adjunto y filtro documental) es equivalente al del original.
- `serialize()` produce un objeto plano JSON: `JSON.parse(JSON.stringify(data))` es igual a
  `data` (sin binario). Debe poder pasar por `JSON.stringify`/`parse` y deserializarse.
- Fuentes de verdad para serializar: `docCollection.export()` (docs con `_id`) y
  `vectorStore.get(col, id).vector` (el vector por id). `dim` se lee de `vectorStore.dim`.
- Saneo post-crash: si un doc no tiene vector asociado (`vectorStore.get` devuelve null,
  estado inconsistente por crash a mitad de upsert/compact o manipulación externa),
  `serialize()` lanza un Error de DOMINIO cuyo mensaje nombra el `id` huerfano (no un
  TypeError crudo). Indica al consumidor correr `compact()` o reinsertar.
- La colección restaurada es **independiente** del original (mutarla no afecta al otro).
- Colección vacía: round-trip válido, `search` devuelve `[]`.
- Reconstrucción vía `upsert` (reusa la lógica ya probada); no reimplementar el join.
- Zero-dependencias; sin IO propio (no toca disco/red); no muta la instancia al serializar.

## Examples
- `SemanticCollection.deserialize(sc.serialize())` -> misma búsqueda que `sc`.
- `serialize().col` y `serialize().dim` reflejan la colección.
- `deserialize(JSON.parse(JSON.stringify(sc.serialize())))` -> equivalente a `sc`.

## Do / Don't
- DO: construir records desde `docCollection.export()` + `vectorStore.get(col, _id)`.
- DO: en `deserialize`, crear `new SemanticCollection({ dim, col })` y reinsertar con `upsert`.
- DON'T: incluir ArrayBuffer/binario en `serialize()`; reimplementar upsert/search; hacer IO.
- DON'T: tocar `tests/`, `knowledge/`, `src/vendor/`, `src/hybrid-merge.js`, `scripts/`.

## Tests
(Congelados en `tests/semantic-collection-persist.test.js`. La suite completa debe seguir
verde: es regresión.)

## Constraints
- PARAR y reportar si... serializar sin binario fuera imposible con la API real de los cores,
  o exigiera cambiar upsert/search; documentar el porqué y responder BLOQUEADO.
