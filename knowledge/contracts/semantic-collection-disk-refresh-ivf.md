---
type: 'Task Contract'
title: 'refresh() invalida el IVF stale del lector de larga vida'
description: 'En modo disco, refresh() invalida el índice IVF en memoria del lector si el archivo .ivf ya no existe (el escritor mutó y lo borró), para que el lector vuelva a escaneo exacto y no devuelva resultados stale.'
tags: ['js-store', 'ccdd', 'semantic', 'disco', 'ivf', 'concurrencia', 'bugfix']

task: semantic-collection-disk-refresh-ivf
intent: "Invalidar el IVF en memoria del lector cuando el archivo .ivf ya no existe en disco."
target: src/semantic-collection.js
target_line: 344
signature: "refresh()"
language: javascript
test_command: "node --test tests/semantic-collection-disk-refresh-ivf.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/semantic-collection-disk-refresh-ivf.test.js
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: semantic-collection-disk-refresh-ivf
## Intent
Arregla un bug de correctitud (hallazgo de auditoría): un lector de larga vida que **auto-cargó**
un índice IVF al abrir [`_autoLoadIvf`](../../src/semantic-collection.js) sigue buscando contra
las posting lists viejas después de `refresh()`, porque `refresh()` releé los logs pero **no
toca `this._diskIvf`**. Cuando el escritor hace `upsert`/`delete`, su `_dropIvf()` **borra el
`.ivf` de disco**; el lector conserva el índice en memoria apuntando a un archivo ya borrado y
devuelve resultados **stale** (omite silenciosamente las escrituras nuevas — pérdida de recall
sin error).

Fix: en `refresh()`, tras releer los stores, si el lector tiene un IVF activo
(`this._diskIvf != null`) pero el archivo `.ivf` **ya no existe** en disco, **invalidar** el
índice en memoria (`this._diskIvf = null; this._diskNProbe = null;`). Así `search` vuelve al
**escaneo exacto** [`vectorStore.search`](../../src/semantic-collection.js) y ve todo lo nuevo.
NO reconstruir el índice en el lector (caro; no le corresponde). Cambio ADITIVO y mínimo dentro
de `refresh()`; no cambia otros métodos ni modos.

## Interface
```js
sc.refresh() -> void
//   Modo disco (this._diskVecPath != null): refresca los dos DiskKV (docs + vectores) como hoy y,
//   ADEMÁS, si this._diskIvf != null y NO existe el archivo (this._diskVecPath + ".ivf"),
//   invalida el índice: this._diskIvf = null; this._diskNProbe = null.
//   Modo memoria/inyección (this._diskVecPath == null): no-op (return inmediato), como hoy.
```

## Invariants
- Se conserva lo actual: guard `if (this._diskVecPath == null) return;` y las dos llamadas
  `this._diskDoc.refresh(); this._diskVec.refresh();`.
- Tras esas llamadas: `if (this._diskIvf != null && !fs.existsSync(this._diskVecPath + ".ivf")) {
  this._diskIvf = null; this._diskNProbe = null; }`.
- Un lector con IVF auto-cargado, tras un `upsert` del escritor (que borró el `.ivf`) y un
  `refresh()`, encuentra el vector nuevo en `search` (cae a escaneo exacto).
- Si NO hubo mutación del escritor (el `.ivf` sigue en disco), `refresh()` **no** invalida el
  IVF (`this._diskIvf` sigue != null): no se invalida gratis.
- No cambia el modo memoria (no-op), ni `reindex`, ni `_autoLoadIvf`, ni `_dropIvf`, ni search.
- Solo stdlib (`fs` ya está importado). Complejidad dentro del budget.

## Examples
- w×30 + reindex(4,4); r abre (auto-carga IVF); w.upsert("TARGET",[1,1,1,1]); r.refresh();
  r.search([1,1,1,1],{limit:5}) incluye "TARGET".
- w×20 + reindex(4,4); r abre; r.refresh() sin mutación => r._diskIvf sigue != null.

## Do / Don't
- DO: añadir SOLO la invalidación condicional al final de `refresh()` (chequear existencia del
  `.ivf` con `fs.existsSync`), reusando `this._diskVecPath`.
- DON'T: reconstruir el IVF en el lector; tocar reindex/_autoLoadIvf/_dropIvf/search/close;
  cambiar el guard de modo memoria; tocar `tests/`, `knowledge/`, `src/disk-*.js`, `src/vendor/`,
  `src/lock.js`, `scripts/`.

## Tests
(Congelados en `tests/semantic-collection-disk-refresh-ivf.test.js`: lector de larga vida ve el
upsert nuevo tras refresh; sin mutación el IVF no se invalida. La suite completa debe seguir verde.)

## Constraints
- PARAR y reportar si... detectar la mutación del escritor por la ausencia del `.ivf` no fuera
  fiable (p. ej. si `reindex` pudiera dejar el archivo ausente con IVF activo); documentar el
  porqué y responder BLOQUEADO.
