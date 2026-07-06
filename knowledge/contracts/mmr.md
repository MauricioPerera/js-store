---
type: 'Task Contract'
title: 'Maximal Marginal Relevance (diversificación de resultados)'
description: 'mmr(candidates, options) selecciona greedy k resultados balanceando relevancia (score) y diversidad (1 - similitud coseno al conjunto ya elegido).'
tags: ['js-store', 'ccdd', 'mmr', 'ab-test']

task: mmr
intent: "Seleccionar greedy resultados balanceando relevancia con diversidad."
target: src/mmr.js
signature: "function mmr(candidates, options)"
language: javascript
test_command: "node --test tests/mmr.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/mmr.test.js
deps_allowed: []
forbids: ['network', 'subprocess', 'filesystem']
---

# Contract: mmr

## Intent
Task DURA del A/B v1(GLM) vs v2(Haiku nativo): implementar **Maximal Marginal Relevance**,
una selección greedy que diversifica resultados. Función pura, nueva (`src/mmr.js`).

## Interface
```js
function mmr(candidates, options) -> Array<{ id, score, ... }>
//   candidates: Array<{ id, score: number, vector: number[] }>. score = relevancia (mayor = más
//               relevante); vector = embedding (misma longitud entre candidatos).
//   options: { k: number (máx resultados), lambda: number en [0,1] }.
//   Devuelve hasta k candidatos, en ORDEN DE SELECCIÓN greedy MMR.
```

## Invariants
- **MMR greedy**: empezando vacío, en cada paso elige el candidato restante que maximiza
  `lambda * score - (1 - lambda) * maxSimAlYaElegido`, donde `maxSimAlYaElegido` es la mayor
  similitud coseno entre el candidato y los ya seleccionados (0 si aún no hay seleccionados).
- El **primer** elegido es siempre el de mayor `score` (sin seleccionados, el término de
  diversidad es 0).
- `lambda = 1` => selección por pura relevancia (score desc).
- `lambda = 0` => pura diversidad: tras el primero, prioriza el más DISÍMIL a lo ya elegido
  (NO simplemente el segundo por score).
- Selección **sin reemplazo** (no repite candidatos).
- `k <= 0` => `[]`. `candidates` vacío => `[]`. `k >= n` => devuelve los `n`.
- Cada resultado conserva al menos `id` y `score` del candidato original.
- Pura, determinista, stdlib; sin IO/red/subprocess.

## Examples
- lambda 1, k 3 sobre [a(.9),b(.85),c(.8)] -> [a,b,c].
- lambda 0, k 2 con a,b iguales en vector y c ortogonal -> [a,c] (no [a,b]).
- k 0 -> []. [] -> [].

## Do / Don't
- DO: extraer helpers (p.ej. `cosine(u,v)`, `maxSim(cand, elegidos)`, `argmaxMMR(...)`) para
  respetar el budget (cyclomatic <= 10, nesting <= 3); NO metas 3 bucles anidados en una función.
- DON'T: devolver top-k por score ignorando la diversidad; repetir candidatos; mutar la entrada.
- DON'T: tocar `tests/`, `knowledge/`, `src/vendor/`, `scripts/`.

## Tests
(Congelados en `tests/mmr.test.js`, incluida la anti-degradación de diversidad con lambda 0.
La suite completa debe seguir verde.)

## Constraints
- PARAR y reportar si... el MMR determinista no fuera expresable dentro del budget con stdlib
  puro; documentar el porqué y responder BLOQUEADO.
