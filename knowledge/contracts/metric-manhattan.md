---
type: 'Task Contract'
title: 'Distancia Manhattan L1'
description: 'manhattan(a,b) devuelve la distancia L1 (suma de valores absolutos de las diferencias) entre dos vectores.'
tags: ['js-store', 'ccdd', 'metric', 'ab-test']
task: metric-manhattan
intent: "Calcular la distancia Manhattan entre dos vectores."
target: src/metric-manhattan.js
signature: "function manhattan(a, b)"
language: javascript
test_command: "node --test tests/metric-manhattan.test.js"
budget: { max_cyclomatic_complexity: 10, max_nesting_depth: 3 }
tests: tests/metric-manhattan.test.js
deps_allowed: []
forbids: ['network', 'subprocess', 'filesystem']
---
# Contract: metric-manhattan
## Intent
Distancia Manhattan L1 entre dos vectores. Funcion pura.
## Interface
```js
function manhattan(a, b) -> number
```
## Invariants
- Devuelve sum(|a[i] - b[i]|). Vectores vacios => 0. Pura, determinista, stdlib.
## Examples
- manhattan([1,2],[4,6]) -> 7.
- manhattan([],[]) -> 0.
## Do / Don't
- DO: sumar Math.abs de las diferencias.
- DON'T: mutar la entrada.
## Tests
(Congelados en tests/metric-manhattan.test.js.)
## Constraints
- PARAR y reportar si... no fuera calculable con stdlib; responder BLOQUEADO.
