---
type: 'Architecture'
title: 'Arquitectura general de js-store'
description: 'Vista de alto nivel de js-store: motor embebido de documentos y vectores en JavaScript puro, sin dependencias de runtime.'
tags: ['js-store', 'arquitectura', 'overview']
---

# Arquitectura general — js-store

js-store es una base de datos **embebida** (corre dentro del proceso host, como una
librería) que combina almacenamiento de **documentos** (JSON) y **búsqueda vectorial**
(similitud sobre embeddings), escrita en **JavaScript puro sin dependencias de runtime**.

## Restricciones de diseño (invariantes del proyecto)

- **Cero dependencias de runtime.** Solo stdlib de Node (`node:*`). Nada en `dependencies`.
- **Embebida, no cliente-servidor.** Se importa como módulo; no hay proceso servidor ni red.
- **Determinista y pura donde se pueda.** La lógica de indexado/consulta se aísla de la I/O.

## Componentes (previstos, se construyen por contrato)

| Componente | Responsabilidad |
|---|---|
| Document store | Insertar/leer/actualizar/borrar documentos JSON identificados por clave. |
| Vector index | Guardar vectores asociados a documentos y resolver *k-NN* por similitud. |
| Query layer | Filtrado por campos + búsqueda vectorial combinada. |
| Persistence | (Opcional/posterior) volcado y carga desde disco vía `node:fs`. |

Cada componente entra al código como una o más funciones con su **contrato CCDD** en
[Contratos de Desarrollo](../contracts/) y sus tests congelados antes de implementar.

## Modelos de datos

- [Documento y vector](../data_models/documents.md) — forma de los registros y del índice.
