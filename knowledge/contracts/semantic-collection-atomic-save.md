---
type: 'Task Contract'
title: 'Guardado atómico (crash-safe) de SemanticCollection'
description: 'Refuerza saveToFile para escribir a un temporal + fsync + rename atómico, de modo que un fallo a mitad no corrompa el archivo previo.'
tags: ['js-store', 'ccdd', 'semantic', 'durabilidad', 'fs']

task: semantic-collection-atomic-save
intent: "Escribir el snapshot de forma atomica con rename sobre un temporal."
target: src/semantic-collection.js
signature: "saveToFile(path)"
language: javascript
test_command: "node --test tests/semantic-collection-atomic-save.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/semantic-collection-atomic-save.test.js
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: semantic-collection-atomic-save

## Intent
Fase A de durabilidad (issue KDD-relacionado "cerrar gap #1"): hoy `saveToFile` escribe
directo con `fs.writeFileSync`, así que un crash a mitad de escritura corrompe el archivo.
Esta tarea lo hace **crash-safe**: escribe a un temporal, hace `fsync`, y renombra
atómicamente sobre el destino. Cambio ADITIVO: misma firma, garantía más fuerte; el resto
de métodos NO cambia.

## Interface
```js
sc.saveToFile(path) -> path
//   Serializa (this.serialize()), escribe el JSON en `path + ".tmp"`, hace fsync del
//   archivo temporal, y luego fs.renameSync(tmp, path) — rename atómico dentro del mismo
//   sistema de archivos. Devuelve `path`. loadFromFile no cambia.
```

## Invariants
- **Crash-safety**: si el `rename` falla (crash simulado), el archivo destino PREVIO queda
  intacto y cargable; `saveToFile` propaga el error (no lo traga).
- Tras un guardado exitoso NO quedan archivos temporales en el directorio destino.
- Sobrescribir un destino existente lo reemplaza por completo con el nuevo estado (válido).
- Round-trip preservado: `loadFromFile(saveToFile(path))` equivale a la colección original.
- `saveToFile` devuelve `path`.
- Usa `node:fs` en forma **namespace** (`fs.writeFileSync`, `fs.openSync`, `fs.fsyncSync`,
  `fs.closeSync`, `fs.renameSync`) — NO destructurar, para que el punto de commit sea
  interceptable y la atomicidad verificable.
- Reusa `this.serialize()` (no reimplementa el volcado). Solo `node:fs` de stdlib; IO síncrono.

## Examples
- `sc.saveToFile(p)` escribe `p.tmp`, fsync, rename a `p`; devuelve `p`.
- Si el rename falla, `p` (si existía) conserva su contenido anterior.

## Do / Don't
- DO: escribir a `path + ".tmp"`, `fs.fsyncSync` del fd temporal, `fs.renameSync(tmp, path)`.
- DO: llamar `fs.<metodo>` en forma namespace (no `const { renameSync } = ...`).
- DON'T: escribir directo sobre `path`; tragar el error del rename; reimplementar serialize.
- DON'T: tocar `tests/`, `knowledge/`, `src/vendor/`, `src/hybrid-merge.js`, `scripts/`.

## Tests
(Congelados en `tests/semantic-collection-atomic-save.test.js`, incluida una inyección de
crash determinista sobre `fs.renameSync`. La suite completa debe seguir verde: es regresión —
en especial `tests/semantic-collection-file.test.js`.)

## Constraints
- PARAR y reportar si... el rename atómico no fuera posible con `node:fs` en este entorno o
  exigiera cambiar `loadFromFile`/`serialize`; documentar el porqué y responder BLOQUEADO.
