---
type: 'Task Contract'
title: 'Colección de documentos en disco (DiskCollection)'
description: 'Colección de documentos respaldada por DiskKV: los docs viven en disco por _id; find/count/remove escanean con matchFilter sin cargar el dataset a RAM.'
tags: ['js-store', 'ccdd', 'disco', 'documentos', 'no-ram']

task: disk-collection
intent: "Almacenar documentos en disco por id consultables por filtro sin cargarlos todos a RAM."
target: src/disk-collection.js
signature: "find(filter)"
language: javascript
test_command: "node --test tests/disk-collection.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/disk-collection.test.js
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: disk-collection
## Intent
Fase 2 del motor en disco: una colección de documentos que guarda cada doc en
[`DiskKV`](../../src/disk-kv.js) por su `_id` (valores en disco, no en RAM) y expone consultas
estilo Mongo reusando `matchFilter` del [core documental](../../src/vendor/js-doc-store.js).
Las queries **escanean** los docs leyéndolos de disco de a uno; el dataset completo **nunca**
se carga a RAM a la vez. Módulo nuevo `src/disk-collection.js`.

## Interface
```js
new DiskCollection(dataPath)          // crea/abre un DiskKV en dataPath.
insert(doc) -> doc                    // guarda doc por doc._id (si falta _id, se genera). Devuelve el doc.
findById(id) -> doc | null            // DiskKV.get(id).
find(filter) -> doc[]                 // docs (leídos de disco de a uno) que cumplen matchFilter(doc, filter).
count(filter) -> number               // nº de docs que matchean (sin filtro = total).
remove(filter) -> number              // borra los que matchean; devuelve el count borrado.
```

## Invariants
- **No-RAM**: los documentos viven en el `DiskKV` (disco). `find`/`count`/`remove` iteran las
  claves y leen cada doc de disco **de a uno** (vía `DiskKV.get`), aplicando `matchFilter`; NO
  se construye un Map/array con TODOS los docs residentes en memoria.
- **Persistencia**: una instancia NUEVA sobre el mismo `dataPath` ve los docs y borrados de otra.
- `insert` guarda por `_id` (genera uno si falta) y devuelve el doc almacenado.
- `find(filter)` devuelve el array de docs que matchean (subconjunto); `find({})` = todos.
- `remove(filter)` borra en el `DiskKV` (tombstone) los que matchean y devuelve cuántos.
- Reusa `DiskKV` y `matchFilter` (no reimplementa storage ni el motor de filtros). Solo stdlib.

## Examples
- insert({_id:"a",tipo:"post"}); findById("a") -> {_id:"a",tipo:"post"}.
- find({tipo:"post"}) -> [docs con tipo post]. count() -> total.
- remove({_id:"a"}) -> 1; findById("a") -> null.

## Do / Don't
- DO: delegar el almacenamiento en `DiskKV`; en `find/count/remove`, iterar `kv.keys()` y
  `kv.get(id)` de a uno, aplicando `matchFilter(doc, filter)`.
- DON'T: cargar todos los docs a un Map/array en memoria; reimplementar matchFilter ni DiskKV.
- DON'T: tocar `tests/`, `knowledge/`, `src/vendor/`, `src/disk-kv.js`, `scripts/`.

## Tests
(Congelados en `tests/disk-collection.test.js`, incluida la prueba No-RAM de instancia nueva.
La suite completa debe seguir verde.)

## Constraints
- PARAR y reportar si... `DiskKV`/`matchFilter` no permitieran esta colección sin cargar todo
  a RAM; documentar el porqué y responder BLOQUEADO.
