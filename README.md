# js-store

Base de datos **embebida** de **documentos** (JSON) y **vectores** (búsqueda por
similitud) escrita en **JavaScript puro, sin dependencias de runtime**.

> Estado: **scaffold**. Aún no hay API implementada; se construye tarea por tarea bajo
> contratos CCDD. Ver [`knowledge/architecture/overview.md`](knowledge/architecture/overview.md).

## Objetivo

Un motor de almacenamiento que corre dentro del proceso host (como una librería), combina
un *document store* con un *vector index*, y no arrastra ninguna dependencia. Restricciones
de diseño en la [arquitectura](knowledge/architecture/overview.md).

## Requisitos

- Node.js >= 20 (usa el runner de tests nativo `node --test`; sin `npm install`).

## Uso (dev)

```bash
npm test          # corre la suite JS (node --test)
```

## Metodología: KDD (Knowledge-Driven Development)

Este proyecto se desarrolla con **KDD**, que unifica:

- **OKF (Open Knowledge Format):** el conocimiento vive como nodos Markdown bajo
  [`knowledge/`](knowledge/index.md), enlazados entre sí (spec:
  [`knowledge/OKF-SPEC.md`](knowledge/OKF-SPEC.md)).
- **CCDD (Contract-Driven Development):** cada función se define en un contrato
  ([`knowledge/contracts/`](knowledge/contracts/)) con firma, `test_command`, budget y
  tests congelados **antes** de implementar.

### Estructura del repo

- `knowledge/` — base OKF (arquitectura, modelos de datos, contratos de tarea).
- `src/` y `tests/` — código JS y sus tests (`node --test`).
- `specs/` y `docs/reports/` — contratos de ejecución de nivel proyecto y sus reportes.
- `scripts/` — validadores deterministas de KDD (Python stdlib; validan la metodología,
  no el código JS).
- `.agents/` — reglas para agentes de IA que clonan el repo.

### Validación (Nivel 1, obligatoria)

```bash
python scripts/validate_contracts.py knowledge/contracts   # contratos OKF+CCDD
python scripts/validate_specs.py specs                     # contratos de ejecución
npm test                                                   # suite JS
```

> Nota: el **gate CCDD Nivel 2** (MCP `ccdd-complexity`) mide complejidad sobre **Python**;
> para el código JS de js-store los budgets de complejidad son **declarativos**, y la
> verificación efectiva es Nivel 1 (validador de contratos + `node --test`).

El detalle del proceso (PLAN → SPEC → DELEGAR → VERIFICAR → COMMIT → CIERRE) está en
[`knowledge/metodologia-ejecucion.md`](knowledge/metodologia-ejecucion.md).

## Licencia

MIT — ver [LICENSE](LICENSE).
