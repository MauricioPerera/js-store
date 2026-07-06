---
type: 'Task Contract'
title: 'Norma euclidea L2'
description: 'l2(v) devuelve la norma euclidea (raiz de la suma de cuadrados) de un vector.'
tags: ['js-store', 'ccdd', 'metric', 'ab-test']
task: metric-l2
intent: "Calcular la norma euclidea de un vector."
target: src/metric-l2.js
signature: "function l2(v)"
language: javascript
test_command: "node --test tests/metric-l2.test.js"
budget: { max_cyclomatic_complexity: 10, max_nesting_depth: 3 }
tests: tests/metric-l2.test.js
deps_allowed: []
forbids: ['network', 'subprocess', 'filesystem']
---
# Contract: metric-l2
## Intent
Norma euclidea L2 de un vector de numeros. Funcion pura.
## Interface
```js
function l2(v) -> number
```
## Invariants
- Devuelve sqrt(sum(v[i]^2)). Vector vacio => 0. Pura, determinista, stdlib.
## Examples
- l2([3,4]) -> 5.
- l2([]) -> 0.
## Do / Don't
- DO: sumar cuadrados y Math.sqrt.
- DON'T: mutar la entrada.
## Tests
(Congelados en tests/metric-l2.test.js.)
## Constraints
- PARAR y reportar si... no fuera calculable con stdlib; responder BLOQUEADO.
