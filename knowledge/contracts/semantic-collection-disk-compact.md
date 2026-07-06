---
type: 'Task Contract'
title: 'Exponer compact() en SemanticCollection (modo disco)'
description: 'compact() reescribe los logs en disco (docs + vectores) dropeando tombstones y versiones superadas; preserva los datos vivos y achica el archivo. En memoria es no-op.'
tags: ['js-store', 'ccdd', 'semantic', 'disco', 'compactacion']

task: semantic-collection-disk-compact
intent: "Compactar los logs en disco de la coleccion delegando en el compact de cada DiskKV."
target: src/semantic-collection.js
target_line: 354
signature: "compact()"
language: javascript
test_command: "node --test tests/semantic-collection-disk-compact.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/semantic-collection-disk-compact.test.js
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: semantic-collection-disk-compact
## Intent
Cierra el issue #2: [`DiskKV.compact()`](../../src/disk-kv.js) existe (reescribe solo los
registros vivos, dropea tombstones y versiones superadas, reemplaza el archivo de forma atómica)
pero `SemanticCollection` no lo expone. Expone `SemanticCollection.compact()` que en **modo disco**
delega en el `compact()` de sus dos `DiskKV` (documentos y vectores); en **memoria/inyección** es
**no-op**. Operación de **escritor** (mutación): quien la llame debería ser el único escritor.
Mismo patrón aditivo que `refresh()`. Cambio ADITIVO.

## Interface
```js
sc.compact() -> void
//   Modo disco (this._diskVecPath != null): this._diskDoc.compact(); this._diskVec.compact();
//   Los datos vivos se preservan; el log se achica; una instancia nueva ve el estado compactado.
//   Modo memoria/inyección (this._diskVecPath == null): no-op (return inmediato).
```
Para habilitar la delegación (cambios ADITIVOS permitidos por este contrato):
- Añadir un método público `compact()` a `DiskCollection` (`src/disk-collection.js`) y a
  `DiskVectorStore` (`src/disk-vectors.js`) que delegue en `this._kv.compact()` (una línea cada
  uno), igual que se hizo con `refresh()`/`keys()`.

## Invariants
- `SemanticCollection.compact()`: si `this._diskVecPath == null` → return (no-op). Si es modo
  disco → `this._diskDoc.compact(); this._diskVec.compact();`.
- `DiskCollection.compact()` y `DiskVectorStore.compact()`: delegan en `this._kv.compact()`; no
  tocan otra lógica.
- Tras `compact()`: `count`, `get`, `search` devuelven el mismo estado lógico que antes (datos
  vivos intactos; los borrados siguen borrados; gana la última versión de cada clave).
- El tamaño de los archivos `.docs`/`.vecs` **no aumenta** y, si había tombstones/versiones
  superadas, **disminuye**.
- Los datos persisten: reabrir tras `compact()` ve el estado compactado.
- No cambia el modo memoria (no-op), ni upsert/delete/search/refresh/close ni otros métodos.
- No reconstruye índices secundarios ni el IVF (fuera de alcance; `compact` no cambia los `_id`,
  así que los índices por id siguen válidos). Solo stdlib; reusa `DiskKV.compact()` (no reimplementa).

## Examples
- 20 upserts + 20 sobreescrituras + 10 deletes; compact() => count()===10, get("d15").n===150,
  get("d5")===null, y statSync(".docs").size disminuye.
- upsert a,b; delete a; compact(); instancia nueva => count()===1, get("b").n===2, get("a")===null.
- new SemanticCollection({dim:3}).compact() => no-op, no lanza.

## Do / Don't
- DO: `compact()` con guard de modo disco que delega en los dos stores; `compact()` delegador de
  una línea en `DiskCollection` y `DiskVectorStore`.
- DON'T: reimplementar la compactación (usar la de `DiskKV`); reconstruir índices/IVF; tocar
  `tests/`, `knowledge/`, `src/disk-kv.js`, `src/vendor/`, `src/lock.js`, `scripts/`.

## Tests
(Congelados en `tests/semantic-collection-disk-compact.test.js`: datos vivos intactos + log más
chico, persistencia tras reabrir, no-op en memoria. La suite completa debe seguir verde.)

## Constraints
- PARAR y reportar si... delegar en `DiskKV.compact()` dejara la colección en estado inconsistente
  (p. ej. si los adaptadores cachearan offsets fuera del `_kv`); documentar el porqué y responder BLOQUEADO.
