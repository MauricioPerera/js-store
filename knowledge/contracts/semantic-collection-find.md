---
type: 'Task Contract'
title: 'Exponer find(filter) en SemanticCollection'
description: 'find(filter) devuelve los docs que matchean un filtro estilo Mongo delegando en el core documental. Misma shape de documento que get(id). En modo disco aprovecha el índice secundario (ensureIndex) para igualdad simple.'
tags: ['js-store', 'ccdd', 'semantic', 'lectura', 'filtro']

task: semantic-collection-find
intent: "Listar los docs que matchean un filtro estilo Mongo (sin búsqueda vectorial) delegando en this.docCollection.find(filter)."
target: src/semantic-collection.js
target_line: 233
signature: "find(filter)"
language: javascript
test_command: "node --test tests/semantic-collection-find.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/semantic-collection-find.test.js
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: semantic-collection-find
## Intent
`SemanticCollection` expone `get(id)`/`count(filter)`/`keys()` pero **no** `find(filter)`: una lectura por
filtro estilo Mongo (docs que matchean, sin búsqueda vectorial). El core documental ya lo resuelve —
`Collection.find` en memoria (vendor, [`src/vendor/js-doc-store.js`](../../src/vendor/js-doc-store.js), wrapper
del `Cursor`) y `DiskCollection.find` en disco ([`src/disk-collection.js`](../../src/disk-collection.js), que usa
el índice secundario para igualdad simple y cae a escaneo en el resto). `SemanticCollection.find(filter)`
delega en `this.docCollection.find(filter)` (mismo patrón aditivo que `get`/`count`). En modo disco eso
exige cablear `find: (f) => dc.find(f)` en el adaptador de `_openDisk`. Cambio ADITIVO: ningún
comportamiento existente cambia.

## Interface
```js
sc.find(filter) -> SIEMPRE un Array de docs (en todos los modos)
//   MEMORIA  (this.docCollection = Collection del vendor): el core devuelve un Cursor lazy; la fachada lo
//            materializa con .toArray() y devuelve el array. El contenedor de salida es un array.
//   DISCO    (adaptador en _openDisk): find: (f) => dc.find(f) -> ya es un array de docs.
//   INYECTADO: si el docCollection inyectado expone find y devuelve un Cursor con .toArray(), la fachada
//            lo materializa; si devuelve un array, lo devuelve tal cual. Requiere que exponga find.
//   En TODOS los modos, cada doc devuelto tiene la misma shape que get(id) del mismo id
//   (el doc tal cual lo devuelve el core: clone en memoria, ref raw en disco).
```
No se añade nada a `DiskCollection` ni al `Collection` del vendor: ya tienen `find`. La fachada
**normaliza el contenedor**: si el resultado de `this.docCollection.find(filter)` es un array lo devuelve
tal cual; si NO es array y tiene `.toArray()` lo materializa; el tipo de retorno es un array en todos
los modos.

## Invariants
- `SemanticCollection.find(filter)`: devuelve un **array** de docs en TODOS los modos. Toma
  `this.docCollection.find(filter)`: si es `Array.isArray` lo devuelve tal cual; si no y tiene
  `.toArray()` (Cursor lazy del core en memoria), devuelve `result.toArray()`.
- INVARIANTE DE CONTENEDOR: `Array.isArray(sc.find(filter)) === true` en modo memoria, modo disco y modo
  inyectado (si el docCollection expone find). La fachada no expone el Cursor lazy del core.
- Modo DISCO: `this.docCollection.find` es `(f) => dc.find(f)`, así que `sc.find(filter)` ===
  `dc.find(filter)` (array de docs). `DiskCollection.find` resuelve igualdad simple sobre campo indexado
  por índice (tras `sc.ensureIndex(field)`) y cae a escaneo (`matchFilter`) en el resto.
- Modo MEMORIA: el `Collection` vendorizado (`find(filter = {})` en `src/vendor/js-doc-store.js`) devuelve
  un `Cursor` lazy; la fachada lo materializa con `.toArray()` (docs que matchean con `matchFilter`).
- Filtro `null`/`undefined`/`{}`: matchea todos los docs (normalización de `matchFilter`/`_scan` a
  "matchea todo"); coherente con `count`.
- Semántica de filtro idéntica entre modos: ambos usan la MISMA `matchFilter` importada de
  `./vendor/js-doc-store.js` (memoria vía `_findRaw`, disco vía `_scan`). Sin divergencia de matching.
- Modo INYECTADO: `find` requiere que el `docCollection` inyectado exponga `find`. No se agregan guards
  mágicos sobre la presencia de `find` (si falta, el error lo da el `docCollection.find` undefined —
  documentado, no interceptado). La normalización de contenedor SÍ aplica: array o `.toArray()` → array.
- No cambia `upsert`/`get`/`count`/`search`/`searchHybrid`/`delete`/`keys`/`refresh`/`compact`/`close`/
  `ensureIndex` ni el modo memoria. Solo stdlib; reusa `find` del core (no reimplementa el filtrado).

## Examples
- modo memoria: upsert a,b con {tipo:"post"/"note"}; `sc.find({ tipo: "post" })` -> [doc de a]
  (Array.isArray === true; shape === `sc.get("a")` por deepStrictEqual).
- modo memoria: `sc.find({ n: { $gt: 2 } })` y `sc.find({})` devuelven arrays con los docs correctos
  (operador y filtro vacío).
- modo disco: upsert a,b,c con {tipo:"post"/"note"/"post"}; `sc.ensureIndex("tipo")`;
  `sc.find({ tipo: "post" })` -> [doc a, doc c] SIN escanear (saboteando `sc._diskDoc._scan` white-box).
- modo disco sin índice: `sc.find({ tipo: "post" })` cae a escaneo y devuelve los docs correctos (array).
- en todo modo: `Array.isArray(sc.find(filter)) === true` y para cada doc devuelto por `find`,
  `deepStrictEqual(doc, sc.get(doc._id))`.

## Do / Don't
- DO: `find(filter) { const r = this.docCollection.find(filter); return Array.isArray(r) ? r : (r && typeof r.toArray === "function") ? r.toArray() : r; }`
  (normaliza el contenedor a array); y `find: (f) => dc.find(f)` en el adaptador de `_openDisk`.
- DON'T: reimplementar el filtrado (usar el `find` del core); exponer el `Cursor` lazy del core fuera de
  la fachada (el contrato es "array siempre"); agregar guards mágicos sobre la presencia de `find` en modo
  inyección; tocar `src/disk-collection.js`, `src/disk-kv.js`, `src/vendor/`, `scripts/`, `.github/`,
  otros tests/contratos existentes.

## Tests
(Congelados en `tests/semantic-collection-find.test.js`: memoria cubre igualdad, operador `$gt` y `{}`;
disco cubre igualdad con índice (white-box saboteando `sc._diskDoc._scan`), caída a escaneo sin índice; en
todo modo la shape de cada doc devuelto coincide con `get(id)` por `deepStrictEqual`. La suite completa
debe seguir verde.)

## Constraints
- PARAR y reportar si... el `find` del vendor en memoria tuviera semántica de filtro incompatible con la
  del modo disco (`matchFilter` distinto), o si exponer `find` exigiera tocar archivos prohibidos
  (`src/disk-collection.js`, `src/vendor/`, `scripts/`, etc.), o si la suite tuviera fallos preexistentes
  no causados por este cambio (verificar con `git stash`); documentar el porqué y responder BLOQUEADO.