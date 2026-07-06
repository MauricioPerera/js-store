# js-store

Base de datos **embebida** de **documentos** (JSON) y **vectores** (búsqueda por
similitud) en **JavaScript puro (CommonJS), sin dependencias de runtime**.

> Estado: **scaffold**. js-store es una **capa de integración** sobre dos cores propios
> vendorizados en [`src/vendor/`](src/vendor/) — [js-doc-store](https://github.com/MauricioPerera/js-doc-store)
> y [js-vector-store](https://github.com/MauricioPerera/js-vector-store). La API unificada
> doc+vector se construye tarea por tarea bajo contratos CCDD. Ver
> [`knowledge/architecture/overview.md`](knowledge/architecture/overview.md).

## Objetivo

Un motor de almacenamiento que corre dentro del proceso host (como una librería), combina
un *document store* con un *vector index* en una sola API, y no arrastra ninguna
dependencia. Restricciones de diseño en la [arquitectura](knowledge/architecture/overview.md).

## Requisitos

- Node.js >= 16 (usa el runner de tests nativo `node --test`; sin `npm install`).

## Uso (dev)

```bash
npm test          # corre la suite JS (node --test "tests/*.test.js")
```

```js
const store = require("js-store");
store.doc.DocStore;      // core de documentos (vendorizado)
store.vector.VectorStore; // core vectorial (vendorizado)
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

> **Nivel 2 (gate CCDD, MCP `ccdd-complexity`) — soportado para JS.** Verificado end-to-end:
> el gate mide complejidad con backend **tree-sitter** (aplica el `budget` de complejidad al
> código JS) y **ejecuta los tests congelados** vía `test_command` verbatim (`node --test`),
> gateando el veredicto por su resultado real. En los contratos de js-store se declara
> `language: javascript` y `test_command: "node --test <ruta>"`. Matices: la **firma** se
> valida por aridad genérica (sin parser nativo para JS → warn `tc-signature-generic`); los
> tests deben ser auto-ejecutables por `node --test` (aquí, CommonJS `tests/*.test.js`); `scan_dependencies`
> razona en clave Python y no se usa como parte del gate JS.

El detalle del proceso (PLAN → SPEC → DELEGAR → VERIFICAR → COMMIT → CIERRE) está en
[`knowledge/metodologia-ejecucion.md`](knowledge/metodologia-ejecucion.md).

## Licencia

MIT — ver [LICENSE](LICENSE).
