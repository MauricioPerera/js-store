---
type: 'Data Model'
title: 'Documento y vector'
description: 'Modelo de datos de js-store: documentos JSON identificados por clave y vectores de embedding asociados para búsqueda por similitud.'
tags: ['js-store', 'data-model', 'documento', 'vector']
---

# Modelo de datos — Documento y vector

Define la forma canónica de los registros de js-store. Las reglas de dominio viven **aquí**;
los contratos de código enlazan a este nodo en vez de duplicarlas.

## Documento

Un **documento** es un objeto JSON serializable con una clave estable.

| Campo | Tipo | Obligatorio | Regla |
|---|---|---|---|
| `id` | string | sí | Único en la colección; no vacío. |
| `data` | object | sí | Cuerpo JSON arbitrario serializable (sin ciclos, sin funciones). |
| `vector` | number[] | no | Embedding asociado; si está, ver reglas de vector. |

## Vector

Un **vector** es un arreglo de números finitos que representa un embedding.

- Todos los elementos son `number` finitos (sin `NaN`, `Infinity`).
- Longitud > 0. Dentro de un mismo índice, **todos los vectores comparten dimensión**;
  mezclar dimensiones distintas es un error.
- La métrica de similitud por defecto es **coseno** (rango `[-1, 1]`).

## Invariantes que NO pertenecen a este modelo

- Persistencia en disco, concurrencia y transacciones son responsabilidad de la
  [arquitectura](../architecture/overview.md), no del registro individual.
