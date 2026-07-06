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
sc.find({ tipo: "post" });   // docs que matchean el filtro estilo Mongo (sin búsqueda vectorial)

// ...otro proceso / reinicio: los datos siguen en disco
const sc2 = new SemanticCollection({ path: "./mi-db", dim: 768 });
sc2.get("d1"); // ✅ lo ve — estaba en disco, no en RAM
```

Cómo lo hace, por capas (todo en JS puro, `node:fs`): `DiskKV` (valores en un log append-only,
lectura por posición) → `DiskCollection` (docs por `_id`, queries por escaneo con `matchFilter`)
→ `DiskVectorStore` (vectores en disco, búsqueda streaming).

El log es append-only, así que crece con cada `upsert`/`delete`. `compact()` lo reescribe
dejando solo los registros vivos (dropea tombstones y versiones superadas) y achica el archivo;
es una operación de **escritor** (usala como el escritor único). No-op en modo memoria.

```js
sc.compact();   // reclama espacio del log de docs y vectores; datos vivos intactos
```

### Índice secundario por campo (`ensureIndex`)

Sin índice, `count`/`find` del core documental **escanean** todos los docs (O(N) lecturas de disco).
Para acelerar la igualdad simple sobre un campo, construí un índice secundario con
`sc.ensureIndex(field)`: en modo disco delega en `DiskCollection.ensureIndex(field)`, que mantiene en
RAM un mapa `valor -> ids` y que `find` usa para resolver `{ field: valor }` sin escanear (cae a
escaneo para filtros complejos). El índice lo mantienen los `upsert`/`delete` posteriores, así que
los docs nuevos quedan cubiertos. No-op en modo memoria.

```js
sc.ensureIndex("tipo");                 // indexa el campo "tipo" sobre los docs actuales
sc.count({ tipo: "post" });             // resuelve por índice (igualdad simple)
sc.find({ tipo: "post" });              // lo mismo: igualdad simple resuelta por índice (cae a escaneo en filtros complejos)
```

> El índice vive en la RAM del proceso que lo creó. En un **lector** de larga vida, los docs que el
> escritor añadió después no entran al índice del lector con `refresh()` (este solo relea la cola del
> log, no reconstruye el índice): volvé a llamar `sc.ensureIndex(field)` tras `refresh()` si lo usás,
> o pasá `refresh({ rebuildIndexes: true })` para que los índices existentes se reconstruyan solos.

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
> disco). La concurrencia soportada es **1 escritor + N lectores** (ver abajo); **no** hay
> multi-escritor. El índice IVF se **persiste y auto-carga** (`.ivf`/`.ivfmeta`); su
> entrenamiento (`reindex`) usa una muestra acotada; la búsqueda es la parte no-RAM (solo lee los
> clusters probados).
>
> **Excepciones al no-RAM (importante):** dos operaciones **sí** materializan **todos** los
> documentos en RAM aunque estés en modo disco —
> - `serialize()` / `saveToFile()` recorren todos los docs para armar el snapshot;
> - `searchHybrid(...)` reconstruye un `BM25Index` completo (rebuild-at-query) escaneando **todos**
>   los docs en **cada** llamada.
>
> Con un dataset que excede la RAM, evitá esas dos rutas (o usalas sabiendo el costo O(N) en
> memoria y lecturas). `search` (vectorial) y las lecturas por id (`get`/`findById`) sí son la
> parte no-RAM.

### Concurrencia (1 escritor + N lectores)

El log de cada store en disco es **append-only** (los registros ya escritos son inmutables), lo
que habilita el mismo modelo que SQLite en modo WAL: **un escritor y varios lectores** sobre el
mismo archivo, sin corrupción.

**Escritor único — `{ path, lock: true }`.** Al abrir en modo disco con `lock: true`, la
colección adquiere un **lockfile** (`path + ".lock"`, con el PID) como primer paso: si otro
proceso **vivo** ya lo tiene, falla rápido; si el lock es **huérfano** (proceso muerto), lo
roba. `close()` lo libera.

```js
const w = new SemanticCollection({ path: "./db", dim: 768, lock: true });
w.upsert("d1", { tipo: "post" }, emb);
// ...otra instancia con { path: "./db", lock: true } y el primero vivo → lanza
w.close();   // libera el lock
```

**Lectores — sin `lock`.** Varias colecciones **sin** `lock` conviven sobre la misma `path` y
**no** bloquean. Una instancia lectora recién abierta escanea el log y ve **todo** lo ya
escrito (incluidas escrituras de otro proceso).

```js
const r = new SemanticCollection({ path: "./db", dim: 768 });   // ve lo que el escritor ya commiteó
r.search(queryVector, { limit: 10 });
```

**Lector de larga vida — `refresh()`.** Para que un lector **ya abierto** vea escrituras
**nuevas** sin reabrir, llamá `sc.refresh()`: relee **solo la cola** de los logs (docs +
vectores) de forma incremental —tolerando un último registro a medio escribir— y actualiza el
índice sin releer todo el archivo. En modo memoria es **no-op**.

```js
const r = new SemanticCollection({ path: "./db", dim: 768 });
// ...el escritor hace w.upsert("d2", ...) en otro proceso...
r.get("d2");     // null (aún no lo vio)
r.refresh();     // relee la cola de los logs
r.get("d2");     // ahora sí; r.search(...) también lo encuentra
```

> `refresh()` actualiza la **vista base** (`get`/`findById`/`count`/`search`) e **invalida un
> índice IVF stale**: si el escritor mutó (lo que borra el `.ivf`), el lector vuelve a **escaneo
> exacto** y ve las escrituras nuevas (no reconstruye el IVF en el lector — eso es tarea de
> `reindex`). Por defecto **no** reconstruye los índices secundarios creados con `sc.ensureIndex`
> (esos quedan stale para registros nuevos — volvé a llamar `sc.ensureIndex` si los usás); con
> `refresh({ rebuildIndexes: true })` los índices existentes se reconstruyen tras releer la cola.

> **Alcance honesto:** 1 escritor + N lectores, **coordinado por lockfile** (no por el SO). No
> hay multi-escritor, ni aislamiento transaccional entre procesos, ni notificación push a los
> lectores (hacen *pull* con `refresh`/reapertura). Suficiente para *un* proceso que escribe y
> otros que consultan; no para escritura concurrente real.

## Rendimiento (benchmark)

Números reales de `bench/semantic-bench.cjs` (Node 24, `DIM=64`, un solo proceso; corré
`node --expose-gc bench/semantic-bench.cjs`). Orientativos — dependen de máquina, `DIM` y datos.

**Modo memoria** (búsqueda por escaneo exacto, sin IVF):

| N docs | upsert | `search` (vector) | `searchHybrid` (vector+BM25) |
|---|---|---|---|
| 1 000 | ~59k docs/s | p50 0.08 ms | p50 2.2 ms |
| 10 000 | ~11k docs/s | p50 0.52 ms | p50 27 ms |
| 50 000 | ~2k docs/s | p50 5.9 ms | p50 181 ms |

**Modo disco** (`{ path }`, `fsync` por escritura; `search` usa el IVF tras `reindex`):

| N docs | upsert | `reindex` (kmeans) | `search` (IVF) | `searchHybrid` (ΔRSS) |
|---|---|---|---|---|
| 1 000 | ~640 docs/s | 51 ms | p50 0.8 ms | +1.5 MB |
| 10 000 | ~675 docs/s | 815 ms | p50 11 ms | ~0 MB |

Lecturas honestas de estos números:
- **`search` en memoria es escaneo O(N)**: lineal con el dataset (6 ms a 50k). Para datasets
  grandes usá el **modo disco + `reindex`** (IVF), que baja la búsqueda a sublineal.
- **`searchHybrid` es el camino caro** y crece lineal (181 ms/consulta a 50k en memoria) porque
  reconstruye el BM25 en memoria por consulta — es el caveat de RAM del modo disco. (El ΔRSS de la
  tabla es un proxy ruidoso, sensible al GC; la materialización en RAM es arquitectónica, no se lee
  limpio de un solo número.)
- **La carga masiva en disco es O(N) y plana** (~650 docs/s, estable entre 1k y 10k), limitada por
  `fsync`. Antes de v0.1.5 era O(N²) (~60 docs/s a 10k y colapsando): cada `upsert` escaneaba todo
  el log de docs vía `remove({_id})`; el fast-path de clave primaria lo bajó a O(1) por upsert.
- **`reindex` (kmeans) es sub-segundo hasta 10k**: no es el cuello de botella a estas escalas.

Con la carga en disco ya O(N) (~650 docs/s), 50k tarda ~75 s (antes era prohibitivo). Para *bulk load*
masivo sigue conviniendo cargar en memoria y `saveToFile`, que evita el `fsync` por registro.

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
