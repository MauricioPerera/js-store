---
type: 'Task Contract'
title: 'Índice IVF sobre disco (IVFDiskIndex)'
description: 'IVFDiskIndex clusteriza los vectores (centroides en RAM, posting lists cluster->ids) y en search lee de disco solo los clusters probados, no todos los vectores.'
tags: ['js-store', 'ccdd', 'ivf', 'disco', 'no-ram']

task: ivf-disk
intent: "Buscar vectores leyendo de disco solo los clusters IVF probados."
target: src/ivf-disk.js
signature: "search(queryVector, k, nProbe)"
language: javascript
test_command: "node --test tests/ivf-disk.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/ivf-disk.test.js
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: ivf-disk
## Intent
Fase 3b-ii (cierre del IVF en disco): sobre [`DiskVectorStore`](../../src/disk-vectors.js) y
[`kmeans`](../../src/kmeans.js), un índice IVF. `build()` clusteriza los vectores (centroides
en RAM, posting lists `cluster -> ids`); `search()` computa los centroides más cercanos a la
query (en RAM) y lee de disco **solo** los vectores de los `nProbe` clusters probados — no
escanea todos. Optimización de velocidad sobre la búsqueda streaming; el requisito no-RAM se
mantiene (al buscar solo se leen los clusters probados).

## Interface
```js
new IVFDiskIndex(dataPath)        // DiskVectorStore de respaldo en dataPath; índice sin construir.
set(id, vector) -> void           // guarda el vector (delega en DiskVectorStore). Índice queda "stale".
remove(id) -> void                // borra el vector.
build(nClusters, sampleSize) -> void
//   Entrena kmeans sobre una MUESTRA acotada (los primeros min(sampleSize, n) vectores) para
//   obtener los centroides; luego asigna TODOS los vectores por STREAMING (lee cada uno de
//   disco, calcula su centroide más cercano, lo agrega al posting list de ese cluster, y
//   descarta el vector). Guarda centroides + posting lists en RAM.
search(queryVector, k, nProbe) -> Array<{ id, score }>
//   Si no hay índice construido o está vacío => []. Ordena los centroides por cercanía a la
//   query, toma los nProbe más cercanos, y SOLO para esos clusters lee de disco cada vector de
//   su posting list, calcula coseno, y devuelve el top-k (score desc).
```

## Invariants
- **No-RAM en search**: solo se leen de disco los vectores de los clusters probados (nProbe);
  los demás no se tocan. En RAM viven los centroides (pequeños) y las posting lists (ids).
- **Build acotado**: el entrenamiento usa a lo sumo `sampleSize` vectores; la asignación es por
  streaming (un vector a la vez, sin retener todos).
- `nProbe >= nClusters` (probar todos) => resultado **exacto** (equivale a escanear todo).
- `search` antes de `build`, o índice vacío => `[]`.
- `search` devuelve `[{id, score}]` ordenado por score coseno **descendente**, truncado a `k`.
- `remove` + `build` de nuevo => el vector borrado no aparece.
- **Persistencia de los vectores**: una instancia NUEVA sobre el mismo `dataPath`, tras `build()`,
  reconstruye el índice desde los vectores en disco y busca (los centroides/postings viven en RAM
  y se reconstruyen con `build`; los vectores persisten en el `DiskVectorStore`).
- Reusa `DiskVectorStore` y `kmeans` (no reimplementa storage ni clustering). Coseno con helper
  local. Solo stdlib; determinista.

## Examples
- set a,b (eje x), c,d (eje y); build(2,100); search([1,0,0],4,2) -> [a,b,c,d] (probe todos = exacto).
- search([1,0,0],5,1) -> incluye a, excluye c/d (cluster lejano no probado).

## Do / Don't
- DO: en `build`, entrenar kmeans con la muestra y asignar por streaming (kv.get de a uno);
  en `search`, ordenar centroides por dist a la query, tomar nProbe, y leer SOLO esos clusters.
- DO: extraer helpers (`cosine`, `dist2`, `nearestCentroids`) para el budget.
- DON'T: leer todos los vectores en `search`; retener todos los vectores en RAM; reimplementar kmeans/DiskVectorStore.
- DON'T: tocar `tests/`, `knowledge/`, `src/vendor/`, `src/disk-vectors.js`, `src/kmeans.js`, `scripts/`.

## Tests
(Congelados en `tests/ivf-disk.test.js`, incluidas exactitud con probe-todos, nProbe=1 que
excluye clusters lejanos, y la prueba No-RAM de instancia nueva. La suite completa debe seguir verde.)

## Constraints
- PARAR y reportar si... el IVF en disco no fuera expresable dentro del budget con `DiskVectorStore`
  y `kmeans`; documentar el porqué y responder BLOQUEADO.
