---
type: 'Task Contract'
title: 'Persistencia del índice IVF (save/load)'
description: 'save/load de IVFDiskIndex: guarda centroides y posting lists a un archivo JSON y los carga sin re-clusterizar.'
tags: ['js-store', 'ccdd', 'ivf', 'disco', 'persistencia']

task: ivf-persist
intent: "Persistir a disco el indice IVF para recuperarlo sin reconstruir."
target: src/ivf-disk.js
signature: "save(indexPath)"
language: javascript
test_command: "node --test tests/ivf-persist.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/ivf-persist.test.js
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: ivf-persist
## Intent
Persistir el índice de [`IVFDiskIndex`](../../src/ivf-disk.js) para no reconstruirlo cada
sesión. `save` escribe los **centroides + posting lists** (pequeños; los vectores ya viven en
el `DiskVectorStore`) a un archivo JSON; `load` los carga y deja el índice listo para `search`
**sin** volver a correr `build` (k-means). Cambio ADITIVO: implementa los dos stubs `save`/`load`;
el resto de `IVFDiskIndex` no cambia.

## Interface
```js
save(indexPath) -> indexPath
//   Escribe JSON.stringify({ centroids: this._centroids, postings: this._postings }) en
//   indexPath (utf8). Lanza si el índice no fue construido (this._centroids es null).
//   Devuelve indexPath.

load(indexPath) -> boolean
//   Si indexPath existe: lo parsea y setea this._centroids y this._postings; devuelve true.
//   Si no existe: devuelve false y deja el índice sin construir (search seguirá dando []).
```

## Invariants
- `save` requiere haber llamado `build` antes: si `this._centroids` es null, **lanza**.
- El archivo escrito es JSON plano con `{ centroids: number[][], postings: string[][] }`.
- `load` de un archivo existente deja el índice equivalente al que estaba al guardarlo:
  `search` tras `load` da los **mismos** resultados que tras `build` (sin re-clusterizar).
- `load` de un archivo inexistente devuelve `false`; con el índice sin construir, `search` da `[]`.
- Los vectores NO se guardan aquí (ya persisten en el `DiskVectorStore` del mismo `dataPath`);
  solo se persiste el índice (centroides + posting lists).
- Usa `node:fs` (síncrono); no reimplementa `build`/`search`. Determinista.

## Examples
- build(2,100); save(f); (nueva instancia) load(f) -> true; search(...) sin build da el resultado correcto.
- load("/no/existe") -> false; search -> [].
- save antes de build -> lanza.

## Do / Don't
- DO: `fs.writeFileSync(indexPath, JSON.stringify({centroids, postings}), "utf8")` en save;
  `fs.existsSync` + `fs.readFileSync` + `JSON.parse` en load.
- DON'T: guardar los vectores en el archivo del índice; reconstruir en `load`; reimplementar build/search.
- DON'T: tocar `tests/`, `knowledge/`, `src/vendor/`, `src/disk-*.js`, `src/kmeans.js`, `scripts/`.

## Tests
(Congelados en `tests/ivf-persist.test.js`, incluida la carga en instancia nueva sin
reconstruir. La suite completa debe seguir verde.)

## Constraints
- PARAR y reportar si... persistir el índice sin los vectores no fuera posible; documentar el
  porqué y responder BLOQUEADO.
