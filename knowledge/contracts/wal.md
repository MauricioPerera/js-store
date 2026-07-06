---
type: 'Task Contract'
title: 'Write-Ahead Log (journal append-only)'
description: 'Módulo WAL para js-store: appendOp añade una operación como línea JSON durable (fsync) y readOps las lee tolerando una última línea torn por crash.'
tags: ['js-store', 'ccdd', 'durabilidad', 'wal', 'fs']

task: wal
intent: "Registrar operaciones como lineas JSON en un journal append-only durable."
target: src/wal.js
signature: "appendOp(walPath, op)"
language: javascript
test_command: "node --test tests/wal.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/wal.test.js
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: wal

## Intent
Primitiva de la Fase B de durabilidad de js-store: un **journal append-only** que registra
cada operación (upsert/delete) como una línea JSON, de forma durable, y las relee para
reconstruir estado tras un crash. Módulo nuevo `src/wal.js`, independiente de
`SemanticCollection` (que lo usará después). Solo `node:fs` de stdlib.

## Interface
```js
appendOp(walPath, op) -> void
//   Serializa `op` como una línea JSON (`JSON.stringify(op) + "\n"`) y la AÑADE (modo append)
//   al archivo `walPath`, con fsync antes de cerrar (durable). Crea el archivo si no existe.

readOps(walPath) -> Array<op>
//   Lee `walPath` y devuelve las operaciones en orden. Si el archivo no existe => []. Tolera
//   una ÚLTIMA línea incompleta (torn write por crash a mitad de append): se ignora.
```

## Invariants
- `appendOp` es append puro: preserva las operaciones previas y añade la nueva al final.
- `appendOp` hace `fsync` del descriptor antes de cerrarlo (durabilidad); usa `node:fs` en
  forma namespace (`fs.openSync("a")`, `fs.writeFileSync(fd,...)`, `fs.fsyncSync`, `fs.closeSync`).
- `readOps` devuelve las ops en el mismo orden en que se añadieron.
- `readOps` de un archivo inexistente o vacío => `[]`.
- **Tolerancia a crash**: una última línea que no parsea como JSON (torn) se ignora; las
  líneas completas previas se devuelven intactas.
- Round-trip exacto de valores complejos (doc anidado, vector de números).
- Determinista; solo `node:fs`; IO síncrono; sin red/subprocess.

## Examples
- appendOp(w, {op:"upsert",id:"a"}); readOps(w) -> [{op:"upsert",id:"a"}].
- readOps("/no/existe") -> [].
- Tras un append torn de la 3ª op, readOps devuelve solo las 2 completas.

## Do / Don't
- DO: `JSON.stringify(op) + "\n"`, `fs.openSync(walPath, "a")`, `fs.fsyncSync(fd)`.
- DO: en `readOps`, `split("\n")`, saltar líneas vacías, `try/catch` el `JSON.parse` (torn).
- DON'T: reescribir el archivo entero en `appendOp`; usar red/subprocess; destructurar fs.
- DON'T: tocar `tests/`, `knowledge/`, `src/vendor/`, `src/semantic-collection.js`, `scripts/`.

## Tests
(Congelados en `tests/wal.test.js`, incluida la tolerancia a una línea torn. La suite
completa debe seguir verde.)

## Constraints
- PARAR y reportar si... el append durable no fuera posible con `node:fs` en este entorno;
  documentar el porqué y responder BLOQUEADO.
