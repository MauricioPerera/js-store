---
type: 'Task Contract'
title: 'Lock de un solo escritor en modo disco de SemanticCollection'
description: 'La opción { path, lock: true } adquiere un lock por colección (impide un 2º escritor vivo); close() lo libera. Los lectores (sin lock) conviven.'
tags: ['js-store', 'ccdd', 'semantic', 'disco', 'concurrencia', 'lock']

task: semantic-collection-disk-lock
intent: "Adquirir un lock de escritor al abrir la coleccion en disco cuando lock es true."
target: src/semantic-collection.js
signature: "SemanticCollection(opts)"
language: javascript
test_command: "node --test tests/semantic-collection-disk-lock.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/semantic-collection-disk-lock.test.js
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: semantic-collection-disk-lock
## Intent
Cierra la concurrencia del modo disco: **un solo escritor**. Con `{ path, lock: true }`, la
colección adquiere un **lock por colección** (`path + ".lock"`, vía el
[módulo lock](../../src/lock.js)) al abrir; un segundo proceso/instancia vivo con `lock: true`
sobre la misma `path` **falla rápido**. Los lectores (sin `lock`) no bloquean (y usan `refresh`
para ver lo escrito). `close()` libera el lock. Cambio ADITIVO; los otros modos no cambian.

## Interface
```js
new SemanticCollection({ path, dim, col, lock })
//   Modo disco. Si lock === true: acquireLock(path + ".lock") como PRIMER paso de _openDisk
//   (lanza si otro proceso VIVO lo tiene; roba un lock stale). Guarda this._lockPath = path + ".lock".
//   Si lock es falsy (default): sin lock (this._lockPath queda null).
sc.close() -> void   // (ya existe) libera el lock si this._lockPath está seteado; no-op si no.
```

## Invariants
- En `_openDisk`, si `lock === true`: `acquireLock(this._diskVecPath?...)` — usar la ruta de lock
  `path + ".lock"` (no la de vectores); hacerlo ANTES de crear los stores; setear
  `this._lockPath = path + ".lock"`. Si `lock` es falsy: no adquirir, `this._lockPath = null`.
- Tras abrir con `lock: true`, existe el lockfile `path + ".lock"`; un segundo `new
  SemanticCollection({ path, lock: true })` con el primero vivo **lanza**.
- `close()` (ya implementado) libera el lock (`releaseLock` + `this._lockPath = null`); sin lock
  activo no lanza.
- Sin `lock` (default): NO se crea lockfile; dos aperturas sobre la misma `path` conviven.
- Los datos persisten igual (el lock no afecta el storage); reabrir tras `close()` ve los datos.
- Reusa `acquireLock`/`releaseLock` (ya importados) y el `close()` existente. Solo stdlib.

## Examples
- new SemanticCollection({path,dim:3,lock:true}) => existe path+".lock"; 2º con lock lanza.
- close() => borra el lock; reabrir con lock funciona y ve los datos.
- sin lock: dos aperturas ok.

## Do / Don't
- DO: en `_openDisk`, al inicio, `if (lock === true) { acquireLock(path + ".lock"); this._lockPath = path + ".lock"; } else { this._lockPath = null; }` — con `path` el argumento de `_openDisk` (agregá el flag al constructor y pásalo).
- DON'T: adquirir lock cuando lock es falsy; cambiar los otros modos ni el resto de _openDisk; reimplementar el lock.
- DON'T: tocar `tests/`, `knowledge/`, `src/vendor/`, `src/lock.js`, `src/disk-*.js`, `scripts/`.

## Tests
(Congelados en `tests/semantic-collection-disk-lock.test.js`: lockfile, 2º escritor bloqueado,
close libera, sin-lock convive. La suite completa debe seguir verde.)

## Constraints
- PARAR y reportar si... el lock por colección exigiera cambiar otros modos o romper la
  regresión; documentar el porqué y responder BLOQUEADO.
