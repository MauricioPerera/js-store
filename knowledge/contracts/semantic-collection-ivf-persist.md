---
type: 'Task Contract'
title: 'Persistencia y auto-carga del índice IVF en SemanticCollection'
description: 'reindex guarda el índice IVF a disco; el modo disco lo auto-carga al abrir; toda mutación borra el índice persistido para no auto-cargar uno stale.'
tags: ['js-store', 'ccdd', 'semantic', 'ivf', 'persistencia']

task: semantic-collection-ivf-persist
intent: "Guardar el indice IVF al reindexar para auto-cargarlo al reabrir en modo disco."
target: src/semantic-collection.js
signature: "reindex(nClusters, nProbe)"
language: javascript
test_command: "node --test tests/semantic-collection-ivf-persist.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/semantic-collection-ivf-persist.test.js
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: semantic-collection-ivf-persist
## Intent
Cierra el ciclo del IVF en modo disco: `reindex` **persiste** el índice (via `IVFDiskIndex.save`)
más su `nProbe`; al abrir en modo disco se **auto-carga** el índice si existe; y **toda mutación**
(`upsert`/`delete`) **borra** el índice persistido para no auto-cargar uno stale (cae a escaneo
exacto). Cambio ADITIVO; los otros modos no cambian.

## Interface
```js
// reindex ahora también persiste:
sc.reindex(nClusters, nProbe)
//   build + IVFDiskIndex.save(this._diskVecPath + ".ivf") + persistir nProbe en
//   this._diskVecPath + ".ivfmeta" (JSON { nProbe }). Activa this._diskIvf/_diskNProbe.

// modo disco (_openDisk): auto-carga al abrir si el índice existe.
// mutaciones (adaptador set/remove): además de invalidar en RAM, borran los archivos del índice.
```

## Invariants
- `reindex`: tras `ivf.build`, hace `ivf.save(this._diskVecPath + ".ivf")` y escribe
  `this._diskVecPath + ".ivfmeta"` con `JSON.stringify({ nProbe })`. Luego setea
  `this._diskIvf = ivf`, `this._diskNProbe = nProbe`.
- **Auto-carga** (en `_openDisk`, tras crear los stores): si existe `this._diskVecPath + ".ivf"`,
  crea `new IVFDiskIndex(this._diskVecPath)`, `load(...)`, setea `this._diskIvf`, y `this._diskNProbe`
  = el `nProbe` del `.ivfmeta` si existe, o un valor grande (probar todos) si no. Extraer un helper
  `_autoLoadIvf()` para respetar el budget.
- **Invalidación en disco**: el adaptador vectorial `set`/`remove` (modo disco), además de
  `this._diskIvf = null`, **borra** los archivos `.ivf` y `.ivfmeta` si existen (helper `_dropIvf()`).
- Tras `reindex` sin mutaciones, reabrir la colección (misma `path`) da `search` correcto **sin**
  llamar `reindex`.
- Tras una mutación, reabrir NO auto-carga el índice (fue borrado) => `search` por escaneo exacto,
  el nuevo estado es consultable.
- Sin `reindex` previo, no hay archivo de índice: reabrir no auto-carga nada; `search` exacto opera.
- Reusa `IVFDiskIndex` (save/load); solo `node:fs`. No cambia otros modos ni métodos.

## Examples
- upsert a,b; reindex(2,2) => existe path+".vecs.ivf". Reabrir => search([1,0,0]) correcto sin reindex.
- reindex(1,1); upsert("z",..); reabrir => search encuentra "z" (índice stale fue borrado).

## Do / Don't
- DO: en reindex, ivf.save + escribir el .ivfmeta; en _openDisk, `_autoLoadIvf()`; en set/remove, `_dropIvf()`.
- DO: extraer helpers `_autoLoadIvf()` y `_dropIvf()` para el budget.
- DON'T: auto-cargar tras una mutación; reimplementar save/load del IVF; cambiar otros modos.
- DON'T: tocar `tests/`, `knowledge/`, `src/vendor/`, `src/ivf-disk.js`, `src/disk-*.js`, `scripts/`.

## Tests
(Congelados en `tests/semantic-collection-ivf-persist.test.js`, con auto-carga tras reindex y
la invalidación en disco por mutación. La suite completa debe seguir verde.)

## Constraints
- PARAR y reportar si... persistir/auto-cargar el índice exigiera cambiar otros modos o romper la
  regresión; documentar el porqué y responder BLOQUEADO.
