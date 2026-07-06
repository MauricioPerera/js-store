---
type: 'Task Contract'
title: 'K-means determinista'
description: 'kmeans(vectors, k, maxIters) agrupa vectores con init determinista (primeros k) e iteraciones de Lloyd; devuelve centroides y asignaciones. Base del IVF en disco.'
tags: ['js-store', 'ccdd', 'kmeans', 'ivf']

task: kmeans
intent: "Agrupar vectores en k clusters de forma determinista."
target: src/kmeans.js
signature: "function kmeans(vectors, k, maxIters)"
language: javascript
test_command: "node --test tests/kmeans.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/kmeans.test.js
deps_allowed: []
forbids: ['network', 'subprocess', 'filesystem']
---

# Contract: kmeans
## Intent
Fase 3b-i del IVF en disco: k-means **determinista** (sin `Math.random`) para clusterizar
vectores. Base sobre la que el índice IVF asigna cada vector a un cluster. Función pura.

## Interface
```js
function kmeans(vectors, k, maxIters) -> { centroids: number[][], assignments: number[] }
//   vectors: array de number[] (misma dimensión). k: nº de clusters. maxIters: tope de iteraciones.
//   assignments[i] = índice de cluster (0..k-1) del vector i. centroids[c] = centro del cluster c.
```

## Invariants
- **Determinista**: init = los PRIMEROS `k` vectores como centroides iniciales (NO usar
  `Math.random`). Iteraciones de Lloyd: asignar cada vector al centroide más cercano (distancia
  euclídea), recomputar cada centroide como la media de sus vectores, repetir hasta estabilizar
  las asignaciones o alcanzar `maxIters`.
- `vectors` vacío => `{ centroids: [], assignments: [] }`.
- `k >= vectors.length` => cada vector es su propio cluster: `assignments = [0,1,2,...]`,
  `centroids = vectors` (copia).
- `k == 1` => un centroide = media de todos; todas las asignaciones `0`.
- El primer vector queda en el cluster `0` (init determinista: `centroids[0] = vectors[0]`).
- `assignments.length === vectors.length`; cada asignación en `0..k-1`.
- Un cluster que quede vacío conserva su centroide anterior (no rompe ni produce NaN).
- Pura (no muta `vectors`), determinista, stdlib. Dos corridas idénticas => resultado idéntico.

## Examples
- kmeans([], 2, 10) -> { centroids: [], assignments: [] }.
- kmeans([[0,0],[0,1],[10,10],[10,11]], 2, 20).assignments -> [0,0,1,1].
- kmeans([[0,0],[2,0],[4,0]], 1, 10) -> { centroids: [[2,0]], assignments: [0,0,0] }.

## Do / Don't
- DO: extraer helpers (`dist2`, `nearest(vec, centroids)`, `mean(vecs)`, `assignAll`,
  `recompute`) para respetar el budget (NO metas 3+ bucles anidados en una función).
- DON'T: usar `Math.random`; mutar `vectors`; producir NaN con clusters vacíos.
- DON'T: tocar `tests/`, `knowledge/`, `src/vendor/`, `scripts/`.

## Tests
(Congelados en `tests/kmeans.test.js`, incluida la prueba de determinismo. La suite completa
debe seguir verde.)

## Constraints
- PARAR y reportar si... un k-means determinista dentro del budget no fuera posible con stdlib;
  documentar el porqué y responder BLOQUEADO.
