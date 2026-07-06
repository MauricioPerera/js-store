---
type: 'Architecture'
title: 'Arquitectura general de js-store'
description: 'Vista de alto nivel de js-store: capa de integración doc+vector sobre dos cores propios vendorizados (js-doc-store y js-vector-store), en JavaScript puro sin dependencias.'
tags: ['js-store', 'arquitectura', 'overview']
---

# Arquitectura general — js-store

js-store es una base de datos **embebida** (corre dentro del proceso host, como una
librería) que unifica almacenamiento de **documentos** y **búsqueda vectorial** en una sola
API, escrita en **JavaScript puro (CommonJS) sin dependencias de runtime**.

No reimplementa el motor: es una **capa de integración** sobre dos cores propios, maduros y
zero-dep, que se **vendorizan** (copian) bajo [`src/vendor/`](../../src/vendor/):

| Core vendorizado | Origen | Responsabilidad |
|---|---|---|
| `js-doc-store.js` | [MauricioPerera/js-doc-store](https://github.com/MauricioPerera/js-doc-store) | Documentos: queries tipo Mongo, índices (Hash/Sorted/Text), joins, agregación, cursores, cifrado, auth. |
| `js-vector-store.js` | [MauricioPerera/js-vector-store](https://github.com/MauricioPerera/js-vector-store) | Vectores: cuantización (Float32/Int8/1-bit), IVF, BM25, HybridSearch, Reranker. |

## Restricciones de diseño (invariantes del proyecto)

- **Cero dependencias de runtime.** Solo stdlib de Node; nada en `dependencies`.
- **Embebida, no cliente-servidor.** Se importa como módulo; sin proceso servidor ni red.
- **CommonJS.** Igual que los cores (`module.exports` / `require`), Node >= 16.
- **Los cores NO se editan aquí.** `src/vendor/*` es copia con cabecera de procedencia
  (repo + commit); cualquier cambio se hace re-vendorizando desde el repo origen, no in-place.

## Capa de integración (lo que js-store construye)

Sobre los cores, js-store añade la API unificada — cada pieza entra por **contrato CCDD**
en [Contratos de Desarrollo](../contracts/) con tests congelados antes de implementar:

- **Fachada** ([`src/index.js`](../../src/index.js)) — reexpone `doc` y `vector`.
- **Colección doc+vector** ([`SemanticCollection`](../../src/semantic-collection.js),
  contrato [semantic-collection.md](../contracts/semantic-collection.md)) — documento con
  embedding asociado y búsqueda semántica nativa: `upsert`/`search`/`searchHybrid` (filtro +
  similitud + BM25 + MMR), `delete`/`get`/`count`/`keys`, `upsertMany`.
- **Persistencia (opt-in, tres capas)** — snapshot atómico (`saveToFile`/`loadFromFile`),
  WAL + recuperación (`openDurable`/`checkpoint`), transacciones (`begin`/`commit`/`rollback`)
  y lock de un solo escritor. Contratos: [file](../contracts/semantic-collection-file.md),
  [durable](../contracts/semantic-collection-durable.md), [tx](../contracts/semantic-collection-tx.md),
  [lock](../contracts/semantic-collection-lock.md).

## Motor en disco (no depende de RAM)

Además del modo en memoria, `SemanticCollection` tiene un **modo disco** (`{ path }`) en el que
el dataset (documentos y vectores) **vive en disco y se lee bajo demanda** — rompe el techo de
RAM. Es **código propio** de js-store (no de los cores vendorizados), construido por capas, cada
una con su contrato CCDD:

| Capa | Archivo | Responsabilidad |
|---|---|---|
| KV durable | [`disk-kv.js`](../../src/disk-kv.js) | log append-only length-prefixed; índice `key→{offset,len}` en RAM; valores **nunca** en RAM (lectura posicionada); `compact()` (compactación), `refresh()` (lectores). |
| Colección doc | [`disk-collection.js`](../../src/disk-collection.js) | docs por `_id` sobre el KV; `ensureIndex(field)` (índice secundario → filtro sin O(N)). |
| Store vectorial | [`disk-vectors.js`](../../src/disk-vectors.js) | vectores sobre el KV; búsqueda por escaneo streaming (coseno). |
| Índice IVF | [`kmeans.js`](../../src/kmeans.js) + [`ivf-disk.js`](../../src/ivf-disk.js) | k-means determinista + IVF sobre disco; `reindex()` construye/persiste/auto-carga (`.ivf`/`.ivfmeta`); la búsqueda lee solo los `nProbe` clusters más cercanos. |

**Concurrencia — 1 escritor + N lectores** (modelo tipo SQLite-WAL): `{ path, lock: true }`
adquiere un lockfile (segundo escritor vivo → falla; stale → lo roba); los lectores sin lock
conviven y ven escrituras nuevas con `refresh()` (relee la cola incremental). Contratos:
[disco](../contracts/semantic-collection-disk.md),
[lock](../contracts/semantic-collection-disk-lock.md),
[refresh](../contracts/disk-kv-refresh.md),
[compact](../contracts/disk-kv-compact.md).

### Límites honestos

- **No** hay multi-escritor, ni SQL/joins/relacional, ni ACID-en-disco (las transacciones son
  del modo memoria). El IVF es **aproximado** salvo `nProbe ≥ nClusters`; `reindex` entrena con
  una muestra acotada. `refresh()` no reconstruye los índices de `ensureIndex`.
- **Excepciones al no-RAM:** `serialize()`/`saveToFile()` y `searchHybrid()` (rebuild-at-query del
  `BM25Index`) recorren **todos** los documentos → materializan el dataset en RAM aunque estés en
  modo disco. `search` vectorial y las lecturas por id son la parte que sí respeta el no-RAM.
- Detalle de uso y ejemplos en el [README](../../README.md) (secciones *Modo disco*,
  *Concurrencia* y *Durabilidad*).

## Modelos de datos

- [Documento y vector](../data_models/documents.md) — forma de los registros y del índice.
