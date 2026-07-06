---
type: 'Task Contract'
title: 'Store de vectores en disco con búsqueda streaming (DiskVectorStore)'
description: 'DiskVectorStore guarda vectores en DiskKV; search los lee de a uno de disco (streaming) y calcula coseno, sin retener todos los vectores en RAM.'
tags: ['js-store', 'ccdd', 'disco', 'vectores', 'no-ram']

task: disk-vectors
intent: "Buscar por similitud coseno leyendo los vectores del disco de a uno."
target: src/disk-vectors.js
signature: "search(queryVector, k)"
language: javascript
test_command: "node --test tests/disk-vectors.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/disk-vectors.test.js
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: disk-vectors
## Intent
Fase 3a del motor en disco: un store de vectores respaldado por [`DiskKV`](../../src/disk-kv.js).
Los vectores viven en disco; `search` los lee **de a uno** (streaming), calcula la similitud
coseno y mantiene el top-k — **nunca** retiene todos los vectores en RAM. Esto ya cumple el
requisito **no-RAM** para vectores (la optimización IVF vendrá aparte). Módulo nuevo
`src/disk-vectors.js`.

## Interface
```js
new DiskVectorStore(dataPath)     // crea/abre un DiskKV en dataPath.
set(id, vector) -> void           // guarda el vector (number[]) por id en disco.
get(id) -> number[] | null        // recupera el vector o null.
remove(id) -> void                // borra el vector.
search(queryVector, k) -> Array<{ id, score }>
//   Recorre las claves; por cada id lee su vector de disco (DiskKV.get), calcula coseno con
//   queryVector, y devuelve los k de mayor score (desc). NO retiene todos los vectores en RAM:
//   lee uno, calcula el score, y descarta el vector (solo conserva {id, score}).
```

## Invariants
- **No-RAM**: los vectores viven en el `DiskKV` (disco). `search` los lee de a uno; en memoria
  solo quedan pares `{id, score}` (floats, pequeños), NUNCA todos los vectores a la vez.
- **Persistencia**: una instancia NUEVA sobre el mismo `dataPath` busca sobre los vectores y ve
  los borrados de otra.
- `search` devuelve `[{id, score}]` ordenado por score **descendente**, truncado a `k`.
- Similitud coseno: `dot(a,b) / (||a|| * ||b||)`; 0 si alguna norma es 0. Usar un helper
  `cosine(a, b)` local (o equivalente).
- `remove` borra en el `DiskKV` (persiste); tras reabrir, el vector no aparece.
- Store vacío => `search` devuelve `[]`.
- Reusa `DiskKV` (no reimplementa el storage). Solo stdlib; determinista.

## Examples
- set("a",[1,0,0]); set("b",[0,0,1]); search([1,0,0],2) -> [{id:"a",...},{id:"b",...}].
- new DiskVectorStore(mismoPath).search(...) ve lo escrito por otra instancia.
- remove("a"); search(...) ya no incluye "a".

## Do / Don't
- DO: delegar el almacenamiento en `DiskKV`; en `search`, iterar `kv.keys()`, `kv.get(id)` de a
  uno, coseno, y quedarte solo con `{id, score}`; ordenar desc y truncar a `k`. Extraé `cosine`.
- DON'T: cargar todos los vectores a un array/Map en RAM; reimplementar DiskKV.
- DON'T: tocar `tests/`, `knowledge/`, `src/vendor/`, `src/disk-kv.js`, `scripts/`.

## Tests
(Congelados en `tests/disk-vectors.test.js`, incluida la prueba No-RAM de instancia nueva.
La suite completa debe seguir verde.)

## Constraints
- PARAR y reportar si... buscar sin retener todos los vectores en RAM no fuera posible con
  `DiskKV`; documentar el porqué y responder BLOQUEADO.
