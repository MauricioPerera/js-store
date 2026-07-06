---
type: 'Task Contract'
title: 'refresh() de lectores en SemanticCollection (modo disco)'
description: 'refresh() relee la cola de los logs en disco (docs + vectores) para que un lector de larga vida vea lo que el escritor anexó, sin reabrir. En memoria es no-op.'
tags: ['js-store', 'ccdd', 'semantic', 'disco', 'concurrencia', 'refresh']

task: semantic-collection-disk-refresh
intent: "Releer la cola de los logs en disco para que el lector vea lo anexado por el escritor."
target: src/semantic-collection.js
target_line: 341
signature: "refresh()"
language: javascript
test_command: "node --test tests/semantic-collection-disk-refresh.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/semantic-collection-disk-refresh.test.js
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: semantic-collection-disk-refresh
## Intent
Expone `refresh()` en `SemanticCollection` para el modo disco: un **lector de larga vida** ve lo
que el escritor **anexó** al log sin tener que reabrir. Delega en el `refresh()` incremental de
[`DiskKV`](../../src/disk-kv.js) (ya implementado) a través de sus dos stores en disco (documentos
y vectores). En modo memoria/inyección es **no-op**. Cierra el gap señalado en el README
(concurrencia 1 escritor + N lectores al nivel de `SemanticCollection`). Cambio ADITIVO.

## Interface
```js
sc.refresh(options?) -> void
//   options.rebuildIndexes (boolean, default false/ausente): si es true, DESPUÉS de refrescar
//   los logs re-corre ensureIndex para cada campo YA indexado del DiskCollection (los que están
//   en _indexes), dejándolos al día con lo anexado. Default false/ausente = comportamiento
//   actual byte-a-byte: los índices secundarios quedan stale para registros nuevos.
//   Modo disco: llama al refresh() de los DiskKV subyacentes (docs + vectores) → el índice de
//   cada uno incorpora los registros anexados por el escritor desde el último scan/refresh.
//   Modo memoria/inyección (sin path): no-op (no lanza), con o sin options.
```
Para habilitar la delegación (cambios ADITIVOS permitidos por este contrato):
- En `_openDisk` (misma clase), guardar referencias a los dos stores: `this._diskDoc = dc;`
  `this._diskVec = dv;` (justo tras crearlos).
- Añadir un método público `refresh()` a `DiskCollection` (`src/disk-collection.js`) y a
  `DiskVectorStore` (`src/disk-vectors.js`) que delegue en `this._kv.refresh()`. (Evita alcanzar
  `._kv` privado desde fuera, igual que se hizo con `keys()`.)

## Invariants
- `refresh()` en `SemanticCollection`: si `this._diskVecPath == null` (modo memoria/inyección) →
  return inmediato (no-op). Si es modo disco → `this._diskDoc.refresh(); this._diskVec.refresh();`.
- `DiskCollection.refresh()` y `DiskVectorStore.refresh()`: delegan en `this._kv.refresh()` (una
  línea cada uno); no tocan otra lógica de esas clases.
- Tras `w.upsert(...)` en un escritor y `r.refresh()` en un lector abierto antes: `r.get(id)`,
  `r.count()` y `r.search(...)` reflejan el nuevo registro; un `w.delete(id)` + `r.refresh()` lo
  oculta.
- `refresh()` sin datos nuevos es idempotente. `refresh()` en modo memoria no lanza.
- **NO** reconstruye índices secundarios (`ensureIndex`) por defecto: esos quedan como estaban
  (fuera de alcance; documentado). Con `options.rebuildIndexes === true` SÍ los reconstruye
  (re-corre `ensureIndex` para cada campo en `_indexes`) tras refrescar los logs. No cambia
  get/upsert/search/close ni ningún otro modo.
- Solo stdlib; reusa el `refresh()` de `DiskKV` (no reimplementar el escaneo de cola).

## Examples
- w.upsert("a",{n:1},[1,0,0]); r.get("a")=null; r.refresh(); r.get("a").n===1 y search lo encuentra.
- w.delete("a"); r.refresh(); r.get("a")===null.
- new SemanticCollection({dim:3}).refresh() => no-op, count()===0.

## Do / Don't
- DO: `refresh()` con guard de modo disco que delega en los dos stores; `refresh()` delegador de
  una línea en `DiskCollection` y `DiskVectorStore`; guardar `this._diskDoc`/`this._diskVec` en `_openDisk`.
- DON'T: reimplementar el escaneo de cola (usar el de `DiskKV`); reconstruir índices secundarios;
  tocar `tests/`, `knowledge/`, `src/vendor/`, `src/disk-kv.js`, `src/lock.js`, `scripts/`.

## Tests
(Congelados en `tests/semantic-collection-disk-refresh.test.js`: lector ve upsert/delete tras
refresh, idempotencia, no-op en memoria. La suite completa debe seguir verde.)

## Constraints
- PARAR y reportar si... delegar en el `refresh()` de `DiskKV` no bastara para que el lector vea
  los registros (p.ej. porque los adaptadores no lean del `_kv` en vivo); documentar el porqué y
  responder BLOQUEADO.
