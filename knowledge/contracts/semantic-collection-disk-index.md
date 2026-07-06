---
type: 'Task Contract'
title: 'Exponer ensureIndex(field) en SemanticCollection (modo disco)'
description: 'ensureIndex(field) construye en RAM un índice valor->ids sobre un campo del doc delegando en DiskCollection; find/count del core lo usan para igualdad simple. En memoria es no-op.'
tags: ['js-store', 'ccdd', 'semantic', 'disco', 'indice']

task: semantic-collection-disk-index
intent: "Indexar un campo del doc en modo disco delegando en DiskCollection.ensureIndex(field)."
target: src/semantic-collection.js
target_line: 365
signature: "ensureIndex(field)"
language: javascript
test_command: "node --test tests/semantic-collection-disk-index.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/semantic-collection-disk-index.test.js
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: semantic-collection-disk-index
## Intent
[`DiskCollection.ensureIndex(field)`](../../src/disk-collection.js) existe (construye y mantiene en
RAM un mapa `valor -> Set(ids)`; `find` lo usa para igualdad simple sobre el campo indexado y cae a
escaneo en el resto; `insert`/`remove` lo mantienen) pero `SemanticCollection` no lo expone.
Expone `SemanticCollection.ensureIndex(field)` que en **modo disco** delega en
`this._diskDoc.ensureIndex(field)`; en **memoria/inyección** es **no-op** (mismo patrón aditivo que
`compact()`/`refresh()`). Cambio ADITIVO: ningún comportamiento existente cambia. No toca
`src/disk-collection.js` (ya tiene `ensureIndex`); solo sube la delegación a la fachada.

## Interface
```js
sc.ensureIndex(field) -> void
//   Modo disco (this._diskVecPath != null): this._diskDoc.ensureIndex(field).
//   Construye this._diskDoc._indexes.get(field) = Map(valorString -> Set(id)) de los docs actuales;
//   idempotente (reconstruye si se llama de nuevo).
//   Modo memoria/inyección (this._diskVecPath == null): no-op (return inmediato).
```
No se añade nada a `DiskCollection`: ya tiene `ensureIndex(field)`. No se cablea `ensureIndex` en el
adaptador `this.docCollection` (la fachada delega directo en `this._diskDoc`, igual que
`compact()`/`refresh()`).

## Invariants
- `SemanticCollection.ensureIndex(field)`: si `this._diskVecPath == null` → return (no-op). Si es
  modo disco → `this._diskDoc.ensureIndex(field)`.
- Tras `sc.ensureIndex("tipo")`: `sc._diskDoc._indexes.get("tipo")` queda poblado con
  `String(valor) -> Set(ids)` de todos los docs actuales (ver `tests/disk-collection-index.test.js`
  como referencia del oráculo white-box).
- `sc.count({ tipo: "..." })` devuelve el valor correcto (delega en `dc.count`, que escanea; el
  índice no cambia el QUÉ, solo el CÓMO de `find`).
- Los upserts POSTERIORES a `ensureIndex` quedan cubiertos: `upsert` usa el adaptador
  (`remove` + `insert`), y `DiskCollection.insert`/`remove` mantienen `_indexes` vía
  `_addToIndexes`/`_removeFromIndexes`. Es el comportamiento real de `DiskCollection.ensureIndex`
  (verificado en `src/disk-collection.js` y `tests/disk-collection-index.test.js`, test "el índice
  se mantiene tras insert").
- En modo memoria/inyección: no-op, no lanza, no muta estado.
- No cambia `upsert`/`get`/`count`/`search`/`searchHybrid`/`delete`/`refresh`/`compact`/`close` ni
  el modo memoria. Solo stdlib; reusa `DiskCollection.ensureIndex()` (no reimplementa).

## Examples
- modo disco: upsert a,b,c con {tipo:"post"/"note"/"post"}; sc.ensureIndex("tipo");
  sc._diskDoc._indexes.get("tipo").get("post") = {a,c}; count({tipo:"post"})===2.
- modo disco: sc.ensureIndex("tipo"); upsert d,{tipo:"post"}; el índice incluye a d
  (cubierta de upserts posteriores); count({tipo:"post"}) refleja el nuevo doc.
- new SemanticCollection({dim:3}).ensureIndex("tipo") => no-op, no lanza.

## Do / Don't
- DO: `ensureIndex(field)` con guard de modo disco que delega en `this._diskDoc.ensureIndex(field)`
  (una línea), igual que `compact()` delega en `this._diskDoc.compact()`.
- DON'T: reimplementar el índice (usar el de `DiskCollection`); tocar `src/disk-collection.js`,
  `src/disk-kv.js`, `src/vendor/`, `scripts/`, `.github/`, otros tests/contratos existentes; cablear
  `ensureIndex` en el adaptador (no hace falta: la fachada habla con `_diskDoc` directo).

## Tests
(Congelados en `tests/semantic-collection-disk-index.test.js`: en modo disco el índice interno del
`DiskCollection` queda poblado y `count({tipo:...})` es correcto; upserts posteriores quedan
cubiertos; no-op en memoria. La suite completa debe seguir verde.)

## Constraints
- PARAR y reportar si... delegar en `DiskCollection.ensureIndex(field)` exigiera modificar lógica
  de `src/disk-collection.js` u otro archivo prohibido, o si el índice no se mantuviera consistente
  con los upserts/delete del adaptador (p. ej. si `count`/`find` cachearan estado fuera de
  `_diskDoc`); documentar el porqué y responder BLOQUEADO.