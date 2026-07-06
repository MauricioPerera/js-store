# js-store

[![CI](https://github.com/MauricioPerera/js-store/actions/workflows/validate.yml/badge.svg)](https://github.com/MauricioPerera/js-store/actions/workflows/validate.yml)

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
const { SemanticCollection } = require("js-store");

// Colección semántica lista para usar (cores en memoria, sin configuración):
const sc = new SemanticCollection({ dim: 768 });

sc.upsert("doc1", { tipo: "post", text: "hola mundo" }, embedding1);
sc.upsert("doc2", { tipo: "note", text: "otra cosa" }, embedding2);

// Búsqueda semántica + filtro documental estilo Mongo:
sc.search(queryVector, { filter: { tipo: "post" }, limit: 5 });
// => [{ id, score, doc }, ...]

// Búsqueda híbrida: fusiona similitud vectorial + relevancia textual (BM25):
sc.searchHybrid(queryVector, "hola mundo", { filter: { tipo: "post" }, limit: 5 });
// modo "rrf" (default) o "weighted" con { vectorWeight, textWeight }

// Borrado y persistencia (serialización a objeto plano JSON):
sc.delete("doc2");
const snapshot = JSON.stringify(sc.serialize());
const restored = SemanticCollection.deserialize(JSON.parse(snapshot));
```

Acceso a los cores vendorizados (uso avanzado / inyección de dependencias):

```js
const store = require("js-store");
store.doc.DocStore;       // core de documentos (vendorizado)
store.vector.VectorStore; // core vectorial (vendorizado)
```

## Modo disco (no depende de RAM) + IVF

Por defecto la colección vive **en memoria** (acotada por RAM). Con un `path`, js-store opera
en **modo disco**: documentos y vectores **viven en disco** y se leen **bajo demanda** — el
dataset completo **nunca** se carga a RAM, así que puede ser **más grande que la memoria**.

```js
const { SemanticCollection } = require("js-store");

// Modo DISCO: los datos NO viven en RAM (se leen de disco bajo demanda).
const sc = new SemanticCollection({ path: "./mi-db", dim: 768 });

sc.upsert("d1", { tipo: "post", text: "..." }, embedding1);
sc.upsert("d2", { tipo: "note", text: "..." }, embedding2);

// Misma API que el modo memoria — pero sin cargar todo a RAM:
sc.search(queryVector, { filter: { tipo: "post" }, limit: 10 });
sc.searchHybrid(queryVector, "texto", { limit: 10 });
sc.get("d1"); sc.count({ tipo: "post" }); sc.delete("d2"); sc.keys();

// ...otro proceso / reinicio: los datos siguen en disco
const sc2 = new SemanticCollection({ path: "./mi-db", dim: 768 });
sc2.get("d1"); // ✅ lo ve — estaba en disco, no en RAM
```

Cómo lo hace, por capas (todo en JS puro, `node:fs`): `DiskKV` (valores en un log append-only,
lectura por posición) → `DiskCollection` (docs por `_id`, queries por escaneo con `matchFilter`)
→ `DiskVectorStore` (vectores en disco, búsqueda streaming).

### Búsqueda por IVF (`reindex`)

Sin índice, la búsqueda vectorial en disco **escanea** todos los vectores (O(N) lecturas). Para
acelerarla, construí un índice **IVF** con `reindex(nClusters, nProbe)`: agrupa los vectores en
clusters (k-means) y la búsqueda lee de disco **solo los `nProbe` clusters más cercanos** a la
query.

```js
sc.reindex(256, 8);   // 256 clusters; la búsqueda prueba los 8 más cercanos
sc.search(queryVector, { limit: 10 });   // lee solo esos clusters (rápido), sin cargar todo a RAM

// Toda mutación invalida el índice → la búsqueda vuelve al escaneo EXACTO hasta el próximo reindex
sc.upsert("d3", { tipo: "post" }, embedding3);
sc.reindex(256, 8);   // reconstruí cuando quieras (modelo build-index / REINDEX)
```

- Con `nProbe >= nClusters` (probar todos) los resultados son **exactos** (equivalen al escaneo).
- El índice IVF (centroides + posting lists) vive en RAM y es **pequeño** (no los vectores);
  se reconstruye con `reindex` (p.ej. al abrir, o tras un lote de `upsert`).
- `reindex` solo aplica al **modo disco** (lanza en modo memoria).

> **Alcance honesto:** el modo disco rompe el **techo de RAM** para el dataset (docs+vectores en
> disco). Siguen siendo de un solo escritor (ver [Durabilidad](#durabilidad)) y sin lectores
> concurrentes coordinados entre procesos; el índice IVF se **reconstruye** por sesión (no se
> persiste todavía). El entrenamiento de `reindex` usa una muestra acotada; la búsqueda es la
> parte no-RAM (solo lee los clusters probados).

## Durabilidad

Por defecto una `SemanticCollection` vive **en memoria**. La durabilidad es **opt-in** y se
construyó en tres capas:

**A · Snapshot atómico** — `saveToFile` escribe a un temporal, hace `fsync` y renombra de
forma atómica: un crash a mitad de escritura **no corrompe** el archivo previo.

```js
sc.saveToFile("col.json");                       // durable y atómico
const sc = SemanticCollection.loadFromFile("col.json");
```

**B · WAL (Write-Ahead Log) + recuperación** — con `openDurable`, cada `upsert`/`delete` se
anexa a un journal append-only (con `fsync`). Tras un crash, `openDurable` reconstruye el
estado combinando el snapshot base con el *replay* del WAL. `checkpoint` consolida el estado
en un snapshot atómico y trunca el WAL.

```js
const sc = SemanticCollection.openDurable({
  path: "col.json",     // snapshot base (opcional)
  walPath: "col.wal",   // journal
  dim: 768,
});
sc.upsert("d1", { text: "..." }, emb);   // aplicado en memoria + anexado al WAL (durable)
// ...si el proceso muere aquí...
const recovered = SemanticCollection.openDurable({ path: "col.json", walPath: "col.wal", dim: 768 });
// ↑ estado reconstruido: snapshot + replay del WAL

sc.checkpoint();   // snapshot atómico + WAL truncado
```

**C · Transacciones** — `begin`/`commit`/`rollback` atómicos. Dentro de la transacción las
mutaciones se aplican en memoria (*read-your-writes*) pero su journaling se **difiere**:
`commit` las vuelca al WAL; `rollback` restaura el estado previo y deja el WAL intacto.

```js
sc.begin();
sc.upsert("d1", { text: "..." }, emb);   // visible para get/search dentro de la tx
sc.upsert("d2", { text: "..." }, emb);
sc.commit();     // → ambas ops al WAL de una vez (atómico)
// sc.rollback() habría descartado ambas, sin tocar el WAL
```

**D · Un solo escritor (lock)** — con un `lockPath`, `openDurable` adquiere un **lockfile**
(con el PID) como primer paso: si otro proceso **vivo** ya lo tiene, falla rápido (evita que
dos escritores corrompan el mismo WAL); si el lock es **huérfano** (proceso muerto), lo roba.
`close()` lo libera.

```js
const sc = SemanticCollection.openDurable({
  path: "col.json", walPath: "col.wal", lockPath: "col.lock", dim: 768,
});
// ...otro proceso que intente openDurable con el mismo lockPath (dueño vivo) → lanza
sc.upsert("d1", { text: "..." }, emb);
sc.close();   // libera el lock
```

> **Alcance honesto:** la colección es **in-memory** (acotada por RAM). El lock garantiza
> **un solo escritor a la vez** (el segundo abridor falla rápido) pero **no** es concurrencia
> multi-proceso real: no hay lectores concurrentes coordinados ni escritura compartida. Las
> transacciones son de estado completo (el `begin` copia el estado, coste O(N), no MVCC).
> Para datos relacionales, concurrencia real o datasets que no caben en RAM, usa SQLite u
> otra base como fuente de verdad; js-store brilla como índice semántico embebido y portable.

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
