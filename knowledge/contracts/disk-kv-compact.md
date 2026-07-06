---
type: 'Task Contract'
title: 'Compactación del log de DiskKV'
description: 'compact() reescribe el log de DiskKV con solo los registros vivos (dropea tombstones y versiones superadas) y reemplaza el archivo atómicamente, reduciendo el tamaño.'
tags: ['js-store', 'ccdd', 'disco', 'compactacion']

task: disk-kv-compact
intent: "Reescribir el log de DiskKV conservando solo los registros vivos."
target: src/disk-kv.js
signature: "compact()"
language: javascript
test_command: "node --test tests/disk-kv-compact.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/disk-kv-compact.test.js
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: disk-kv-compact
## Intent
El log de [`DiskKV`](../../src/disk-kv.js) es append-only: cada `put`/`delete` **anexa** un
registro, así que el archivo **crece indefinidamente** (versiones superadas + tombstones nunca
se liberan). `compact()` reescribe el log dejando **un** registro por clave viva (la versión
vigente) y reemplaza el archivo **atómicamente**, reduciendo el tamaño. Cambio ADITIVO:
implementa el stub `compact`; el resto de `DiskKV` no cambia.

## Interface
```js
compact() -> void
//   Reescribe el log solo con los registros de las claves VIVAS (las de this._index; NO las
//   borradas). Reemplaza el archivo de datos atómicamente (temporal + rename) y deja el índice
//   y el fd apuntando al archivo compactado. El estado lógico (get/keys) no cambia; el tamaño baja.
```

## Invariants
- Tras `compact()`, `get(k)` de cada clave viva devuelve su **último** valor; las claves
  borradas siguen dando `null`; `keys()` = las vivas (sin duplicados).
- El archivo compactado tiene **un** registro por clave viva (sin versiones viejas ni tombstones);
  su tamaño es **menor** que el del log con versiones/tombstones acumulados.
- **Atómico**: escribir a un temporal, `fsync`, y `fs.renameSync(tmp, this._path)`; luego reabrir
  el fd sobre el archivo nuevo y reconstruir `this._index` (offsets nuevos) y `this._deleted` (vacío).
- **Persistencia**: una instancia NUEVA sobre el mismo path ve el estado compactado.
- Tras `compact`, `put`/`get` siguen funcionando (índice/fd válidos).
- `compact` de un store vacío no rompe (`keys()` = `[]`).
- Solo `node:fs` (namespace); IO síncrono; sin red/subprocess. Reusa el formato de registro
  existente (`[len(4 BE)][payload JSON]`).

## Examples
- put("a",v1); put("a",v2); delete("b"); compact() => get("a")=v2, get("b")=null, tamaño menor.
- compact(); new DiskKV(mismoPath) ve el estado compactado.

## Do / Don't
- DO: iterar `this._index` (claves vivas), leer cada payload del archivo actual, escribirlo al
  temporal con su header, registrar el nuevo offset; `fsync`; cerrar el fd viejo; `renameSync`;
  reabrir fd; setear el índice nuevo y `this._deleted = new Set()`.
- DON'T: perder datos vivos; dejar tombstones/versiones viejas; reescribir sin rename atómico.
- DON'T: tocar `tests/`, `knowledge/`, `src/vendor/`, `scripts/`.

## Tests
(Congelados en `tests/disk-kv-compact.test.js`: preservación, reducción de tamaño, persistencia.
La suite completa debe seguir verde.)

## Constraints
- PARAR y reportar si... compactar con rename atómico no fuera posible con `node:fs`; documentar
  el porqué y responder BLOQUEADO.
