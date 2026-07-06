---
type: 'Task Contract'
title: 'Índice IVF en SemanticCollection modo disco (reindex)'
description: 'reindex(nClusters, nProbe) construye un IVFDiskIndex sobre los vectores en disco y hace que search use IVF; toda mutación invalida el índice (fallback a escaneo exacto).'
tags: ['js-store', 'ccdd', 'semantic', 'ivf', 'disco']

task: semantic-collection-reindex
intent: "Construir un indice IVF sobre los vectores en disco para acelerar search."
target: src/semantic-collection.js
signature: "reindex(nClusters, nProbe)"
language: javascript
test_command: "node --test tests/semantic-collection-reindex.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/semantic-collection-reindex.test.js
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: semantic-collection-reindex
## Intent
Cablea el [`IVFDiskIndex`](../../src/ivf-disk.js) al modo disco de
[`SemanticCollection`](../../src/semantic-collection.js). Un método `reindex(nClusters, nProbe)`
construye el IVF sobre los vectores en disco; a partir de ahí `search`/`searchHybrid` usan el
IVF (leen solo los clusters probados). **Toda mutación** (`upsert`/`delete`, vía el adaptador
vectorial en modo disco) **invalida** el índice → search cae a **escaneo exacto** hasta el
próximo `reindex` (evita resultados stale). Cambio ADITIVO; los demás modos no cambian.

## Interface
```js
sc.reindex(nClusters, nProbe) -> void
//   Solo en modo disco (lanza si no lo es). Construye un IVFDiskIndex sobre el archivo de
//   vectores del modo disco y lo activa para las búsquedas siguientes con ese nProbe.
```

## Invariants
- En `_openDisk` (modo disco) se guardan `this._diskVecPath` (ruta del archivo de vectores),
  `this._diskIvf = null`, `this._diskNProbe = null`.
- El **adaptador vectorial** en modo disco:
  - `set(col,id,vec)` => `dv.set(id,vec)` **y** `this._diskIvf = null` (invalida el índice).
  - `remove(col,id)` => `dv.remove(id)` **y** `this._diskIvf = null`.
  - `search(col,q,limit)` => si `this._diskIvf` está activo, `this._diskIvf.search(q, limit,
    this._diskNProbe)`; si no, `dv.search(q, limit)` (escaneo exacto). El resultado se mapea a
    `{ id, score, metadata: {} }`.
- `reindex(nClusters, nProbe)`: lanza si `this._diskVecPath` es null (no es modo disco). Si no,
  crea `new IVFDiskIndex(this._diskVecPath)`, `ivf.build(nClusters, sampleSize)` (sampleSize
  razonable, p.ej. `Math.max(nClusters * 256, 1024)`), y setea `this._diskIvf = ivf`,
  `this._diskNProbe = nProbe`.
- Con `nProbe >= nClusters` los resultados de `search` son **exactos** (equivalen al escaneo).
- Tras `reindex`, un `upsert`/`delete` invalida el IVF y el nuevo estado es consultable por
  escaneo exacto (no quedan resultados stale).
- El filtro documental (`buildAllowedIds`) sigue operando igual (no cambia).
- Los modos inyección y RAM, y el resto de métodos, **no cambian** (regresión).
- Reusa `IVFDiskIndex` (no reimplementa el IVF). Solo stdlib.

## Examples
- disco: upsert a,b,c; reindex(2,2); search([1,0,0],{limit:1}) -> "a".
- reindex(1,1); upsert("z",..); search hacia z -> "z" (IVF invalidado, escaneo exacto).
- reindex en modo RAM -> lanza.

## Do / Don't
- DO: guardar refs en `_openDisk`; ternario en el adaptador `search`; invalidar en `set`/`remove`;
  implementar `reindex` con `IVFDiskIndex`. Extraer un helper si el constructor/reindex excede budget.
- DON'T: reimplementar el IVF; dejar el IVF activo tras una mutación; cambiar los otros modos.
- DON'T: tocar `tests/`, `knowledge/`, `src/vendor/`, `src/ivf-disk.js`, `src/disk-*.js`, `scripts/`.

## Tests
(Congelados en `tests/semantic-collection-reindex.test.js`, incluida la invalidación por
mutación y la prueba No-RAM. La suite completa debe seguir verde: es regresión.)

## Constraints
- PARAR y reportar si... cablear el IVF exigiera cambiar el comportamiento del modo disco sin
  reindex o romper la regresión; documentar el porqué y responder BLOQUEADO.
