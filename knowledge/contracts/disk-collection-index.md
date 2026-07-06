---
type: 'Task Contract'
title: 'Índice secundario sobre campos del doc (DiskCollection)'
description: 'ensureIndex(field) mantiene en RAM un índice valor->ids; find, count y remove usan el índice para igualdad simple sobre un campo indexado (evita escanear), y caen a escaneo para filtros complejos.'
tags: ['js-store', 'ccdd', 'disco', 'indice', 'documentos']

task: disk-collection-index
intent: "Indexar un campo del doc para resolver find por igualdad sin escanear."
target: src/disk-collection.js
signature: "ensureIndex(field)"
language: javascript
test_command: "node --test tests/disk-collection-index.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/disk-collection-index.test.js
deps_allowed: []
forbids: ['network', 'subprocess', 'filesystem']
---

# Contract: disk-collection-index
## Intent
Hoy `find/count/remove` de [`DiskCollection`](../../src/disk-collection.js) **escanean** todos
los docs (O(N) lecturas de disco). Esta tarea añade un **índice secundario** por campo:
`ensureIndex(field)` construye y mantiene en RAM un mapa `valor -> Set(ids)`; `find` lo usa
para resolver una **igualdad simple** sobre un campo indexado leyendo solo los ids que matchean,
y cae a **escaneo** para el resto. Cambio ADITIVO. `this._indexes` (Map field -> Map(valorString
-> Set(id))) ya está inicializado en el constructor.

## Interface
```js
ensureIndex(field) -> void
//   Construye this._indexes.get(field) escaneando los docs actuales: por cada doc, agrega su _id
//   al Set en la clave String(doc[field]). Idempotente (reconstruye si se llama de nuevo).

find(filter)   // usa el índice si el filtro es { field: valorPrimitivo } y field está indexado:
               //   lee solo los ids de this._indexes.get(field).get(String(valor)); si no, escanea.
count(filter)  // mismo criterio que find: si es igualdad simple sobre campo indexado devuelve
               //   ids.length sin escanear; si no, escanea contando. Resultado idéntico al escaneo.
insert(doc)    // además de guardar, actualiza cada índice: agrega doc._id al Set de String(doc[field]).
remove(filter) // además de borrar, retira los ids borrados de cada índice; usa el índice si el
               //   filtro es { field: valorPrimitivo } y field está indexado (resuelve los ids a
               //   borrar sin escanear); si no, escanea. Resultado idéntico al escaneo.
```

## Invariants
- `ensureIndex(field)` deja `this._indexes.get(field)` con `String(valor) -> Set(ids)` de todos
  los docs actuales.
- `insert(doc)`: por cada `field` en `this._indexes`, agrega `doc._id` al Set de `String(doc[field])`.
- `remove(filter)`: por cada doc borrado, retira su `_id` de todos los índices.
- `find(filter)`: si `filter` tiene exactamente una clave `f`, `this._indexes` tiene `f`, y
  `filter[f]` NO es objeto (igualdad simple) => devuelve los docs de los ids
  `this._indexes.get(f).get(String(filter[f]))` (leídos de disco). En cualquier otro caso =>
  escaneo con `matchFilter` (comportamiento actual).
- `count(filter)`: mismo criterio que `find` => devuelve `ids.length` (ids del índice) sin
  escanear; en cualquier otro caso => escaneo contando. Resultado **idéntico** al escaneo.
- El resultado de `find`/`count` es **idéntico** con o sin índice (el índice solo cambia el CÓMO, no el QUÉ).
- `remove(filter)`: mismo criterio que `find`/`count` => si `filter` tiene exactamente una clave
  `f`, `this._indexes` tiene `f`, y `filter[f]` NO es objeto (igualdad simple) => resuelve los docs
  a borrar como `this._indexes.get(f).get(String(filter[f]))` leídos de disco (`_indexLookup`
  devuelve una copia de los ids, así que mutar el `Set` al borrar no rompe la iteración); en
  cualquier otro caso => escaneo con `matchFilter` (comportamiento actual). Por cada doc borrado
  retira su `_id` de todos los índices. Resultado **idéntico** al escaneo (mismos docs, misma
  cantidad).
- Reusa `DiskKV`/`matchFilter`; solo stdlib; determinista.

## Examples
- insert a(post),b(note),c(post); ensureIndex("tipo"); _indexes.tipo.get("post") = {a,c}.
- find({tipo:"post"}) -> [a,c] (vía índice). find({n:{$gt:3}}) -> escaneo.
- count({tipo:"post"}) -> 2 (vía índice). count({n:{$gt:3}}) -> escaneo. count({tipo:"wiki"}) -> 0.
- remove({tipo:"post"}) -> 2 (vía índice); borra a,c del KV y los retira del índice; queda
  `_indexes.tipo.get("post")` vacío y `_indexes.tipo.get("note")` intacto. remove({n:{$gt:3}})
  -> escaneo. remove({tipo:"wiki"}) -> 0 sin escanear.

## Do / Don't
- DO: mantener `this._indexes` en insert/remove; en `find`, detectar la igualdad simple sobre
  campo indexado y usar el Set de ids; si no, escanear. Extraer helpers para el budget.
- DON'T: devolver resultados distintos a los del escaneo; indexar filtros complejos; romper find/count/remove existentes.
- DON'T: tocar `tests/`, `knowledge/`, `src/vendor/`, `src/disk-kv.js`, `scripts/`.

## Tests
(Congelados en `tests/disk-collection-index.test.js`, con white-box sobre `_indexes` para
verificar la construcción/mantenimiento. La suite completa debe seguir verde.)

## Constraints
- PARAR y reportar si... mantener el índice consistente con insert/remove no fuera posible;
  documentar el porqué y responder BLOQUEADO.
