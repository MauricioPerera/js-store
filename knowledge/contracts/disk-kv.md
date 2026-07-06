---
type: 'Task Contract'
title: 'Store clave-valor en disco (no depende de RAM)'
description: 'DiskKV persiste pares clave-valor en un log en disco; los valores viven en disco y se leen por posición bajo demanda, no se retienen en RAM.'
tags: ['js-store', 'ccdd', 'disco', 'durabilidad', 'no-ram']

task: disk-kv
intent: "Almacenar pares clave-valor en disco sin retener los valores en RAM."
target: src/disk-kv.js
signature: "put(key, value)"
language: javascript
test_command: "node --test tests/disk-kv.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/disk-kv.test.js
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: disk-kv

## Intent
Ladrillo base para que js-store **no dependa de RAM**: un store clave-valor cuyos **valores
viven en disco** y se leen bajo demanda. En RAM solo se mantiene un índice pequeño
`clave -> {offset, length}`; los valores (docs/vectores, la parte pesada) NUNCA se retienen en
memoria. Módulo nuevo `src/disk-kv.js`. Solo `node:fs` de stdlib.

## Interface
```js
new DiskKV(dataPath)
//   Abre/crea el archivo de datos en dataPath. Si ya existe, reconstruye el índice
//   clave->offset escaneando el log (una pasada de IO; NO carga los valores a RAM).

put(key, value) -> void
//   Serializa value (JSON) y lo AÑADE al log en disco (append), registra su offset/length en
//   el índice. El valor NO se guarda en RAM. Sobrescribir una clave añade un registro nuevo
//   (gana el último). fsync para durabilidad.

get(key) -> value | null
//   Busca el offset de key; lee EXACTAMENTE esos bytes del disco (fs.read posicionado) y los
//   parsea. Devuelve null si la clave no existe o fue borrada. Lee de disco (no de un cache RAM).

delete(key) -> void
//   Marca la clave como borrada (tombstone en el log). get pasa a devolver null; keys() la excluye.

keys() -> string[]
//   Claves vigentes (no borradas), sin duplicados.
```

## Invariants
- **No-RAM de los valores**: los valores se escriben y se leen del archivo en disco; no se
  mantienen en un Map/estructura en memoria. La única estructura RAM permitida es el índice
  `clave -> {offset, length}` (o equivalente pequeño) y el set de claves borradas.
- **Persistencia real**: una instancia NUEVA de `DiskKV` sobre el mismo `dataPath` ve los
  valores y los borrados escritos por otra instancia (prueba de que están en disco).
- `put` es append (no reescribe el archivo entero); sobrescribir = registro nuevo, gana el último.
- `get` lee por posición (`fs.readSync` con offset/length, o `fs.readSync` sobre fd abierto) — no
  lee el archivo entero por consulta.
- `delete` persiste (tombstone); tras reabrir, la clave sigue borrada.
- `keys()` no incluye borradas ni duplicados.
- Solo `node:fs` (namespace); IO síncrono; sin red/subprocess. Determinista.

## Examples
- put("a",{n:1}); get("a") -> {n:1}. get("x") -> null.
- kv1.put("a",..); new DiskKV(mismoPath).get("a") -> {n:1} (estaba en disco).
- put("a",..); delete("a"); get("a") -> null.

## Do / Don't
- DO: log append-only con registros length-prefixed; índice clave->offset en RAM; `fs.read`
  posicionado en `get`; `fs.fsyncSync` tras escribir.
- DON'T: mantener los VALORES en un Map en RAM; reescribir el archivo entero en cada put;
  leer el archivo completo en cada get.
- DON'T: tocar `tests/`, `knowledge/`, `src/vendor/`, `scripts/`.

## Tests
(Congelados en `tests/disk-kv.test.js`, incluida la prueba No-RAM con instancia nueva. La
suite completa debe seguir verde.)

## Constraints
- PARAR y reportar si... leer por posición sin retener valores en RAM no fuera posible con
  `node:fs` en este entorno; documentar el porqué y responder BLOQUEADO.
