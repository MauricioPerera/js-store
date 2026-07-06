---
type: 'Task Contract'
title: 'Apertura durable y checkpoint de SemanticCollection'
description: 'openDurable carga snapshot y reproduce el WAL para recuperar estado tras un crash; checkpoint escribe un snapshot atómico y trunca el WAL.'
tags: ['js-store', 'ccdd', 'semantic', 'durabilidad', 'wal', 'checkpoint']

task: semantic-collection-durable
intent: "Recuperar la coleccion combinando el snapshot con el replay del WAL."
target: src/semantic-collection.js
signature: "openDurable(opts)"
language: javascript
test_command: "node --test tests/semantic-collection-durable.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/semantic-collection-durable.test.js
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: semantic-collection-durable

## Intent
Cierre de la Fase B: apertura con **recuperación** y **checkpoint** para
[`SemanticCollection`](../../src/semantic-collection.js). `openDurable` reconstruye el estado
desde un snapshot base + el replay del [WAL](../../src/wal.js), y deja el journaling activo;
`checkpoint` consolida (snapshot atómico) y trunca el WAL. Cambio ADITIVO: implementa los dos
stubs `static openDurable(opts)` y `checkpoint()`; el resto no cambia.

## Interface
```js
SemanticCollection.openDurable({ path, walPath, dim, col }) -> SemanticCollection
//   Si `path` existe: parte de deserialize(JSON del snapshot). Si no: colección nueva {dim,col}.
//   Reproduce readOps(walPath) en orden (upsert/delete) SIN journalizar (journaling apagado
//   durante el replay). Al terminar deja this.snapshotPath = path y this.walPath = walPath
//   (journaling ACTIVO para las mutaciones posteriores). Devuelve la colección.

sc.checkpoint() -> path
//   Escribe el snapshot atómico en this.snapshotPath (this.saveToFile) y luego trunca el WAL
//   (this.walPath queda vacío). Devuelve this.snapshotPath.
```

## Invariants
- **Recuperación**: `openDurable` tras un crash reconstruye el estado exacto (snapshot +
  ops del WAL en orden). Sin snapshot ni WAL => colección vacía usable.
- **No re-journaliza en el replay**: aplicar el snapshot y el WAL durante `openDurable` NO
  añade ops al WAL (journaling desactivado hasta después del replay). Reabrir no duplica el WAL.
- **checkpoint**: snapshot primero (atómico, vía `saveToFile`), luego truncar el WAL. Tras
  checkpoint `readOps(walPath)` es `[]` y el estado persiste en el snapshot.
- **Crash-safety del checkpoint**: si se escribe el snapshot pero NO se trunca el WAL (crash
  a medias), reabrir aplica el snapshot y reproduce el WAL de forma **idempotente** (upsert por
  id, delete idempotente) => estado correcto, sin duplicar.
- Journaling posterior: tras `openDurable`, las mutaciones se anexan al WAL (ya cubierto por B2a).
- Reusa `deserialize`, `saveToFile`, `upsert`/`delete`, `readOps` (no reimplementa nada). Solo stdlib.

## Examples
- open, upsert a/b, delete a, "crash", openDurable -> {b}.
- open, upsert a, checkpoint (a en snapshot, WAL vacío), upsert b, reopen -> {a,b}.

## Do / Don't
- DO: en `openDurable`, construir el estado con journaling APAGADO y activarlo (`this.walPath`)
  solo al final; guardar `this.snapshotPath`.
- DO: en `checkpoint`, `this.saveToFile(this.snapshotPath)` y truncar (`fs.writeFileSync(this.walPath, "")`).
- DON'T: journalizar durante el replay; reimplementar serialize/append; usar red/subprocess.
- DON'T: tocar `tests/`, `knowledge/`, `src/vendor/`, `src/wal.js`, `src/hybrid-merge.js`, `scripts/`.

## Tests
(Congelados en `tests/semantic-collection-durable.test.js`, incluida la recuperación tras
crash y el crash entre snapshot y truncado. La suite completa debe seguir verde.)

## Constraints
- PARAR y reportar si... la recuperación idempotente no fuera posible con la API existente o
  exigiera cambiar `upsert`/`delete`/`serialize`; documentar el porqué y responder BLOQUEADO.
