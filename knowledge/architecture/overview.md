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

- **Fachada** ([`src/index.js`](../../src/index.js)) — reexpone `doc` y `vector`; hoy es el
  único código propio y solo reexporta (aún sin lógica integradora).
- **Colección doc+vector** (previsto) — documentos con embedding asociado y búsqueda
  semántica nativa (upsert de doc + vector, query híbrida filtro+similitud).
- **Persistencia unificada** (previsto/posterior) — un bundle que combine ambos stores.

## Modelos de datos

- [Documento y vector](../data_models/documents.md) — forma de los registros y del índice.
