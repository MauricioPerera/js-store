---
type: 'Task Contract'
title: 'Refresh de lectores en DiskKV (1 escritor + N lectores)'
description: 'refresh() relee la cola del log (registros anexados desde el último scan) y actualiza el índice, tolerando un último registro incompleto (torn).'
tags: ['js-store', 'ccdd', 'disco', 'concurrencia']

task: disk-kv-refresh
intent: "Releer la cola del log para que un lector vea lo anexado por el escritor."
target: src/disk-kv.js
signature: "refresh()"
language: javascript
test_command: "node --test tests/disk-kv-refresh.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/disk-kv-refresh.test.js
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: disk-kv-refresh
## Intent
Habilita **1 escritor + N lectores** sobre el mismo archivo. Como el log de
[`DiskKV`](../../src/disk-kv.js) es **append-only** (los registros existentes son inmutables),
un lector puede ver de forma segura lo que un escritor va anexando: `refresh()` relee la **cola**
del log (desde donde el lector quedó) y actualiza su índice, **tolerando** un último registro
incompleto (torn: el escritor escribiéndolo justo ahora). Cambio ADITIVO: implementa el stub
`refresh`; el resto de `DiskKV` no cambia salvo trackear el cursor de scan.

## Interface
```js
refresh() -> void
//   Relee desde this._scanPos hasta el tamaño actual del archivo; por cada registro COMPLETO
//   actualiza el índice (put => set offset; tombstone => delete) y avanza this._scanPos; si el
//   siguiente registro está incompleto (header o payload fuera del tamaño actual), se detiene
//   SIN avanzar (lo verá en el próximo refresh, cuando esté completo).
```

## Invariants
- El constructor debe dejar `this._scanPos` en el fin de lo ya escaneado (p.ej. tras el scan
  inicial, `this._scanPos = fs.fstatSync(this._fd).size`). `compact()` debe fijar `this._scanPos`
  al tamaño del archivo compactado.
- `refresh()`: mientras `pos < size` (size = `fs.fstatSync(this._fd).size` actual):
  - si `pos + 4 > size` => registro incompleto (header) => **break** (no avanzar).
  - `N = readUInt32BE` del header; si `pos + 4 + N > size` => payload incompleto (torn) => **break**.
  - parsea el payload (JSON) en `pos + 4`; aplica al índice (put/tombstone); avanza
    `pos` y `this._scanPos` al fin del registro.
- Un lector que llama `refresh()` ve los `put`/`delete` que el escritor anexó (nuevas claves,
  borrados, y sobreescrituras — gana la última versión).
- `refresh()` sin datos nuevos es idempotente (no cambia nada, no rompe).
- **No** relee desde 0 cada vez (incremental por `this._scanPos`); un registro torn NO se aplica
  hasta estar completo.
- Solo `node:fs` (namespace); IO síncrono. Reusa el formato `[len(4 BE)][payload JSON]` y `_readAt`.

## Examples
- w=new DiskKV(p); r=new DiskKV(p); w.put("a",v); r.get("a")=null; r.refresh(); r.get("a")=v.
- w.delete("a"); r.refresh(); r.get("a")=null.

## Do / Don't
- DO: trackear `this._scanPos` (constructor + compact); en `refresh`, escanear la cola con
  tolerancia a registro incompleto (break sin avanzar).
- DON'T: releer todo el archivo desde 0 en cada refresh; aplicar un registro torn; cambiar el
  comportamiento de get/put/delete/keys.
- DON'T: tocar `tests/`, `knowledge/`, `src/vendor/`, `scripts/`.

## Tests
(Congelados en `tests/disk-kv-refresh.test.js`: lector ve puts/deletes/overwrites tras refresh,
idempotencia. La suite completa debe seguir verde.)

## Constraints
- PARAR y reportar si... releer la cola de forma segura no fuera posible con `node:fs`;
  documentar el porqué y responder BLOQUEADO.
