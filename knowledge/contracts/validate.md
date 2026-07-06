---
type: 'Task Contract'
title: 'Validador puro de entrada para js-store'
description: 'Valida id, doc y vector de un item antes de insertarlo en la coleccion y devuelve las violaciones encontradas.'
tags: ['js-store', 'ccdd', 'validate']

task: validate
intent: "Validar los campos de un item de entrada."
target: src/validate.js
signature: "function validateInput(id, doc, vector, dim)"
language: javascript
test_command: "node --test tests/validate.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/validate.test.js
deps_allowed: []
forbids: ['network', 'subprocess', 'filesystem']
---

# Contract: validate

## Intent
Función pura `validateInput(id, doc, vector, dim)` que revisa un item de entrada
(`id`, `doc`, `vector`) contra las reglas de dominio de js-store y devuelve un array
de strings legibles con las violaciones encontradas (vacío si todo es valido).
No lanza excepciones ante ningun input, sea cual sea su forma.

## Interface
```js
function validateInput(id, doc, vector, dim)
// Retorna: string[] -- un mensaje por cada violacion detectada, [] si no hay ninguna.
// dim: entero positivo asumido valido (no se valida a si mismo).
```

## Invariants
- `id` debe ser string no vacio. Si es ausente, no-string, o `""` -> agrega una
  violacion que nombra "id".
- `doc` debe ser un objeto plano: no `null`, no array, `typeof doc === "object"`.
  Si no cumple -> agrega una violacion que nombra "doc".
- `vector` debe ser un Array de longitud EXACTA `=== dim`, con TODOS los elementos
  numeros finitos (sin `NaN`, sin `Infinity`/`-Infinity`). Si `vector` no es array,
  o su longitud es distinta de `dim`, o algun elemento no es numero finito ->
  agrega una violacion que nombra "vector".
- Se acumulan TODAS las violaciones detectadas; nunca se corta en la primera.
- Funcion PURA: determinista, no muta `id`/`doc`/`vector`, no usa IO/red/subprocess,
  no lanza ante ningun input arbitrario (objetos raros, `undefined`, `Symbol`,
  circular refs, etc.), solo stdlib de JavaScript.
- `dim` se asume entero positivo correcto; la funcion no lo valida.

## Examples
- `validateInput("a", {}, [1, 2], 2)` -> `[]` (valido).
- `validateInput("", {}, [1, 2], 2)` -> incluye una violacion de "id".
- `validateInput(123, null, [1, NaN], 2)` -> violaciones para "id", "doc" y "vector"
  simultaneamente (acumulacion).
- `validateInput("a", [1, 2], [1, 2, 3], 2)` -> violaciones para "doc" (es array) y
  "vector" (longitud 3 != dim 2).

## Do / Don't
- DO: devolver siempre un array de strings, nunca lanzar.
- DO: acumular todas las violaciones en una sola pasada.
- DO: nombrar el campo afectado en cada mensaje ("id", "doc", "vector").
- DON'T: validar `dim` en si mismo.
- DON'T: mutar ninguno de los argumentos recibidos.
- DON'T: usar red, filesystem, ni subprocess.
- DON'T: tocar otros archivos del repo fuera de `src/validate.js`.

## Tests
Congelados en `tests/validate.test.js`. Cubren: caso valido, cada regla por separado,
acumulacion de multiples violaciones a la vez, y casos adversariales (vector con NaN,
con Infinity, longitud incorrecta, no-array; doc `null`/array; id ausente/numerico/vacio;
inputs totalmente arbitrarios que no deben lanzar).

## Constraints
- PARAR y reportar si... cumplir las reglas de dominio obligara a lanzar una excepcion
  ante algun input, o a mutar alguno de los argumentos recibidos; documentar el porque
  y responder BLOQUEADO.
