---
type: 'Task Contract'
title: 'SemanticCollection en modo disco (no depende de RAM)'
description: 'Un modo { path } en el constructor que respalda SemanticCollection con DiskCollection + DiskVectorStore vía adaptadores, para que la API pública opere sin cargar los datos a RAM.'
tags: ['js-store', 'ccdd', 'semantic', 'disco', 'no-ram']

task: semantic-collection-disk
intent: "Respaldar SemanticCollection con los stores en disco cuando se pasa path."
target: src/semantic-collection.js
signature: "SemanticCollection(opts)"
language: javascript
test_command: "node --test tests/semantic-collection-disk.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/semantic-collection-disk.test.js
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: semantic-collection-disk
## Intent
Fase 4 del motor en disco: cablear el store documental y el vectorial en disco
([`DiskCollection`](../../src/disk-collection.js), [`DiskVectorStore`](../../src/disk-vectors.js))
a la API pública de [`SemanticCollection`](../../src/semantic-collection.js) mediante
**adaptadores finos** que exponen la MISMA interfaz que los cores en RAM. Con `{ path }`, la
colección opera **sin cargar los datos a RAM** (los métodos existentes NO cambian; solo se les
inyectan stores respaldados por disco). Cambio ADITIVO.

## Interface
```js
new SemanticCollection({ path, dim, col })
//   Nuevo modo DISCO (opt-in por `path`, si no se inyecta vectorStore):
//   - dim = dim ?? 768.
//   - dc = new DiskCollection(path + ".docs"); dv = new DiskVectorStore(path + ".vecs").
//   - this.docCollection = adaptador que expone { insert, findById, count, remove, export }.
//   - this.vectorStore   = adaptador que expone { dim, set, get, remove, search }.
//   Los métodos existentes (upsert/get/search/searchHybrid/delete/count/keys) operan sin cambios.
```

## Invariants
- Discriminador de modo en el constructor: `vectorStore` presente => inyección (existente);
  si no, `path` presente => **disco**; si no, `dim` => conveniencia en RAM (existente).
- **Adaptador documental** sobre `DiskCollection dc`:
  `insert(doc)->dc.insert(doc)`, `findById(id)->dc.findById(id)`, `count(f)->dc.count(f)`,
  `remove(f)->dc.remove(f)`, `export()->dc.find({})`.
- **Adaptador vectorial** sobre `DiskVectorStore dv` (ignora el arg `col`):
  `dim` = dim resuelto; `set(col,id,vec)->dv.set(id,vec)`;
  `get(col,id)->` `null` si no existe, si no `{ id, vector: dv.get(id), metadata: {} }`;
  `remove(col,id)->dv.remove(id)`; `search(col,q,limit)->dv.search(q,limit).map(h=>({id:h.id, score:h.score, metadata:{}}))`.
- **No-RAM**: una instancia NUEVA con el mismo `path` ve los docs+vectores y los borrados de
  otra (porque viven en disco); `search`/`get`/`count`/filtro documental operan tras reabrir.
- Los modos inyección y conveniencia-RAM existentes **no cambian** (regresión).
- Reusa `DiskCollection`/`DiskVectorStore` (no reimplementa storage). Solo stdlib.

## Examples
- new SemanticCollection({path:p,dim:3}); upsert("a",{tipo:"post"},[1,0,0]); otra instancia sobre p -> get("a") ve el doc y search lo encuentra.
- searchHybrid opera en modo disco (BM25 sobre docs leídos de disco vía export()).

## Do / Don't
- DO: ramificar el constructor por `path`; construir los dos stores en disco y envolverlos en
  adaptadores objeto-literal con exactamente los métodos de arriba. Extraer un helper
  (p.ej. `_openDisk(path, dim)`) si el constructor excede el budget.
- DON'T: cambiar upsert/search/searchHybrid/etc. ni los modos existentes; cargar todos los
  docs/vectores a RAM en el modo disco.
- DON'T: tocar `tests/`, `knowledge/`, `src/vendor/`, `src/disk-*.js`, `scripts/`.

## Tests
(Congelados en `tests/semantic-collection-disk.test.js`, con las pruebas No-RAM de instancia
nueva. La suite completa debe seguir verde: es regresión.)

## Constraints
- PARAR y reportar si... los adaptadores no bastaran para que la API existente opere sobre los
  stores en disco sin cargar todo a RAM; documentar el porqué y responder BLOQUEADO.
