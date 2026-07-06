# Changelog

Todas las versiones notables de **js-store**. Formato basado en
[Keep a Changelog](https://keepachangelog.com/); versionado [SemVer](https://semver.org/).

## [0.1.9] — 2026-07-06

### Docs
- **Límites conocidos documentados (A3, A5–A7, A9 de la 3ª auditoría)**, todos en el README:
  (A3) un lector abierto no ve escrituras posteriores a un `compact()` del escritor y debe reabrir;
  (A5) `{ path }` (modo disco) y `{ walPath }` (memoria+WAL) son modos distintos, no se combinan;
  (A6) `releaseLock` no verifica el PID dueño (seguro dentro de `close()`, footgun como export);
  (A7) el `_id` autogenerado puede colisionar entre escritores sin `lock: true`;
  (A9) el over-fetch de la búsqueda con filtro es una heurística que puede perder recall con filtros
  muy selectivos (pasá `overFetch` mayor). Comentario de `resolveOverFetch` corregido en el código.

## [0.1.8] — 2026-07-06

### Docs
- **Acotado el alcance de "atómico" en transacciones (A2)**: `commit` es atómico en memoria y frente
  a `rollback`, NO frente a un crash a mitad del volcado al WAL (el WAL no tiene marcadores
  begin/commit; un crash entre dos ops deja media transacción que `openDurable` replaya). Corregido
  en README y contrato `semantic-collection-tx.md`; un `checkpoint()` tras el commit acota la ventana.
- **Corregida la equivalencia índice↔escaneo para tipos mixtos (A4)**: el índice secundario usa
  `String(valor)` como clave, así que colapsa `1` y `"1"`. Para valores de tipo mixto, `find`/`count`/
  `remove` por índice pueden devolver MÁS matches que el escaneo exacto. El claim "idéntico en
  semántica" ahora se acota a "para valores del mismo tipo" (README + contrato `disk-collection-index.md`).

### Fixed
- **`checkpoint()` con `snapshotPath` pero sin `walPath` lanza Error de dominio (A1)**: espejo
  exacto de H4. `openDurable({ path, dim })` sin `walPath` es config aceptada (walPath opcional;
  `readOps(null)` tolera) y deja `this.walPath == null`; `checkpoint()` llamaba
  `fs.writeFileSync(null, "")` y reventaba con `TypeError` crudo de fs. Ahora lanza, justo antes
  del truncado, un Error de dominio que menciona `walPath` e indica pasar `{ walPath }` a
  `openDurable`. No se toca el resto de `checkpoint` ni de `openDurable`.
- **`DiskKV.compact()` robusto ante `renameSync` que falla + limpieza de `.compact` huérfano (A8)**:
  en Windows, si un lector tenía el archivo abierto, `renameSync` lanzaba `EPERM` después de
  cerrar el fd viejo, dejando la instancia rota (`EBADF` en toda operación posterior) y un
  `<path>.compact` huérfano. Ahora, si el rename falla, reabre `this._fd` sobre el archivo
  original (intacto, sin compactar), limpia el tmp huérfano y lanza un Error de dominio claro;
  `_index`/`_deleted`/`_scanPos` no se mutan (siguen apuntando al original). Además, el
  constructor borra un `<dataPath>.compact` huérfano de un compact que crasheó antes del rename,
  antes de abrir el fd (seguro: un `.compact` es siempre basura parcial). El camino feliz no
  cambia.

## [0.1.7] — 2026-07-06

### Docs
- **Límites conocidos documentados en el README (H5, H6 de la auditoría)**: (H6) el robo de un
  lock stale no es atómico — dos escritores que arrancan a la vez tras un crash pueden robar el
  mismo lock huérfano y creerse ambos escritores (más el caveat de reuso de PID); (H5) `delete()`
  de un id inexistente apendea igual un tombstone al log de vectores (intencional: así limpia
  vectores huérfanos sin doc; se recupera con `compact()`).

### Fixed
- **`SemanticCollection.serialize()` lanza Error de dominio ante un doc sin vector (H2)**:
  `recordFromDoc` hacía `vectorStore.get(col, id).vector` y, si `get` devolvía `null` (doc
  presente pero vector ausente, alcanzable por un crash a mitad de `compact` o manipulación
  externa), reventaba con `TypeError` crudo ("Cannot read properties of null"). Ahora chequea
  `null` y lanza un Error de dominio que nombra el `id` huerfano e indica correr `compact()`
  o reinsertar. El camino feliz no cambia.
- **`search`/`searchHybrid` excluyen hits huerfanos (vector-sin-doc) (H3)**: un crash entre el
  `set` del vector y el `insert` del doc en `upsert` dejaba un vector sin doc; sin filtro,
  `search`/`searchHybrid` armaban resultados con `doc: null` y un consumidor que hiciera
  `hit.doc.campo` reventaba. Ahora ambos métodos filtran `r.doc != null` tras armar los hits.
  Semánticamente idéntico en operación normal (todo vector tiene su doc); post-crash el
  huerfano simplemente no aparece. No se toca el resto de la lógica de `search`/`hybrid`.
- **`checkpoint()` sin `snapshotPath` lanza Error de dominio (H4)**: `openDurable({ walPath })`
  sin `path` es una config aceptada (path es opcional) y deja `this.snapshotPath == null`;
  `checkpoint()` llamaba `saveToFile(null)` y `renameSync` reventaba con un `TypeError` de `fs`.
  Ahora lanza al inicio un Error de dominio que menciona `snapshotPath`/`path` e indica pasar
  `{ path }` a `openDurable`. No se toca el resto de `checkpoint` ni `openDurable`.

## [0.1.6] — 2026-07-06

### Fixed
- **`SemanticCollection.begin()` lanza en modo disco**: las transacciones son del modo
  memoria (snapshot en RAM + journaling diferido). En modo disco (constructor con `{ path }`),
  un `upsert` dentro de la tx hace `fsync` directo al log y `rollback` restaura cores en
  memoria sin tocar `_diskVecPath`, dejando la instancia híbrida (estado divergente) y la op
  persistida al reabrir desde disco. Ahora `begin()` lanza con un mensaje de dominio claro
  antes de poder activar la tx; `commit`/`rollback` quedan protegidos por transitividad. El
  modo `openDurable` (memoria + WAL, `_diskVecPath` null) NO se ve afectado: sus tx siguen
  permitidas. Hallazgo H1 de una auditoría externa.
- **`readOps` del WAL solo tolera torn tail; lanza en corrupción del medio**: el catch
  silencioso dropeaba cualquier línea que no parseara y seguía el replay, así una op
  faltante en el medio del journal pasaba sin señal. Como el WAL es append-only + `fsync`
  por op, una línea corrupta solo puede ser la última con contenido (torn tail de un crash
  mid-append), que se sigue tolerando; una línea que no parsea con ops válidas después es
  corrupción del medio y ahora lanza `readOps: WAL corrupto en la línea N (no es la última)`.
  `appendOp` no se toca. Hallazgo H7 de una auditoría externa.

## [0.1.5] — 2026-07-06

### Fixed
- **`DiskCollection.remove({ _id: primitivo })` borra por la clave primaria en O(1)**: antes caía a
  `_scan` (lee y parsea todos los docs del log) porque `_id` no está en `_indexes`, haciendo la
  carga masiva en disco O(N²) (un `_scan` O(N) por upsert, vía `SemanticCollection.upsert`). Ahora
  un fast-path aditivo resuelve el doc con `kv.get(_id)` y lo borra con `kv.delete(_id)` sin escanear
  y retirándolo de los índices secundarios. Cambio ADITIVO y semánticamente idéntico: mismo valor de
  retorno y mismo estado final que el camino por escaneo en todos los casos; los filtros que no sean
  `{ _id: primitivo }` (incluidos operadores sobre `_id`) siguen por `_indexLookup`/`_scan`. La
  carga masiva de N docs pasa de O(N²) a O(N).

## [0.1.4] — 2026-07-06

### Security
- **Re-vendorizado `js-doc-store` @ 1adf71a (v1.2.1)**: comparación de hash de password en
  tiempo constante (`Auth._verifyPassword` ya no usa `===` con early-exit sobre el hash;
  usa un `_constantTimeEqual` portable). Cambio ADITIVO en el vendor; el resto del core
  intacto. Hallazgo de una auditoría externa de un consumidor downstream (js-base).

## [0.1.3] — 2026-07-06

### Fixed
- **`DiskKV` reopen tolerante a registro torn al final del log**: un crash mid-append podía
  dejar un registro incompleto (header sin payload, o payload parcial) al final del log;
  al reabrir, `_scan` hacía `JSON.parse` a ciegas y lanzaba `SyntaxError`, dejando la
  colección irrecuperable. Ahora `_scan` chequea límites antes de leer (igual que
  `refresh()`), corta el barrido en el primer registro incompleto, reconstruye el índice
  con los registros completos y trunca el archivo al último offset bueno para que el log
  quede sano. Sin torn => sin truncar, comportamiento idéntico. `refresh()` (camino del
  lector) sigue sin truncar.

## [0.1.2] — 2026-07-06

### Added
- **`SemanticCollection.refresh({ rebuildIndexes: true })`** (modo disco): opción opt-in que, tras
  refrescar los logs, re-corre `ensureIndex` para cada campo ya indexado del `DiskCollection` y deja
  los índices secundarios al día con lo anexado por el escritor. Default `false`/ausente = comportamiento
  actual byte-a-byte (índices stale para registros nuevos). No-op en memoria.
- **`SemanticCollection.find(filter)`**: lectura por filtro estilo Mongo (docs que matchean, sin búsqueda
  vectorial) delegando en `this.docCollection.find(filter)`. Misma shape de documento que `get(id)`. En modo
  disco cablea `find: (f) => dc.find(f)` en el adaptador de `_openDisk`, que aprovecha el índice secundario
  (`ensureIndex`) para igualdad simple y cae a escaneo en el resto. Devuelve SIEMPRE un array de docs en
  todos los modos (en memoria materializa el `Cursor` del core con `.toArray()`).

### Changed
- **`DiskCollection.remove(filter)`** (modo disco): usa el índice secundario para igualdad simple
  sobre campo indexado (resuelve los ids a borrar por índice sin escanear); cae a escaneo en el
  resto, idéntico en semántica y valor de retorno. Espejo del fix de `count` (commit baac444).

## [0.1.1] — 2026-07-06

### Added
- **`DiskCollection.count(filter)`** (modo disco): usa el índice secundario para igualdad simple
  sobre campo indexado (devuelve `ids.length` sin escanear); cae a escaneo en el resto, idéntico
  en semántica. Hace que `ensureIndex` beneficie al camino público expuesto por `SemanticCollection.count`.
- **`SemanticCollection.compact()`** (modo disco): compacta los logs de docs y vectores (dropea
  tombstones y versiones superadas, achica el archivo) delegando en `DiskKV.compact()`. No-op en
  memoria. Expone en la fachada una operación que antes solo era accesible bajando a `DiskKV`
  (cierra #2).
- **`SemanticCollection.ensureIndex(field)`** (modo disco): expone el índice secundario de
  `DiskCollection` (mapa en RAM `valor -> ids` para igualdad simple sobre un campo) delegando en
  `DiskCollection.ensureIndex(field)`; mantenido por `upsert`/`delete`. No-op en memoria.

### Changed
- `validate_specs.py`: cuando `specs/` no tiene contratos, imprime **`AVISO`** (0 validados,
  `specs/` es opcional) en vez de un `OK` idéntico al de una validación real — evita una falsa
  señal verde en CI. Exit 0 sin cambios. Test nuevo que lo cubre. Cierra #3.

### Docs
- Documentado el caveat de RAM del modo disco: `serialize()`/`saveToFile()` y `searchHybrid()`
  materializan **todos** los documentos en RAM aunque el dataset viva en disco (README + nodo OKF
  de arquitectura). Corregida de paso una nota obsoleta (el IVF **sí** se persiste/auto-carga).
  Cierra #1.

### Fixed
- **IVF stale en lector de larga vida**: `SemanticCollection.refresh()` ahora invalida el índice
  IVF en memoria del lector si el escritor mutó (el `.ivf` fue borrado), evitando pérdida de
  recall silenciosa (el lector vuelve a escaneo exacto). Test de regresión que reproduce el
  escenario 1 escritor + N lectores con IVF auto-cargado.
- Sincronizado `index.js` `VERSION` con `package.json` (`0.1.0`).

## [0.1.0] — 2026-07-06

Primera release etiquetada. Base de datos **embebida** de documentos + vectores en **JavaScript
puro (CommonJS), sin dependencias de runtime**. Toda pieza entró por contrato CCDD con tests
congelados. **253 tests, CI verde.**

### Núcleo doc+vector
- `SemanticCollection`: colección unificada documento + embedding.
- `upsert` / `upsertMany` / `get` / `count` / `keys` / `delete`.
- `search` (similitud vectorial + filtro tipo Mongo + MMR) y `searchHybrid` (vector + BM25).
- Métricas de distancia: coseno, L2 y Manhattan.

### Persistencia (opt-in, en memoria)
- **Snapshot atómico**: `saveToFile` / `loadFromFile` (temp + fsync + rename; un crash no corrompe).
- **WAL + recuperación**: `openDurable` / `checkpoint` (journal append-only; replay tras crash).
- **Transacciones**: `begin` / `commit` / `rollback` (atómicas, read-your-writes).
- **Lock de un solo escritor**: `lockPath` (lockfile con PID; roba locks huérfanos).

### Motor en disco (no depende de RAM) — código propio, no vendorizado
- `SemanticCollection({ path })`: documentos y vectores **viven en disco**, se leen bajo demanda.
- `DiskKV`: log append-only length-prefixed; valores nunca en RAM (lectura posicionada).
  - `compact()`: compacta el log (arregla el crecimiento infinito).
  - `refresh()`: relee la cola incremental (habilita lectores de larga vida).
- `DiskCollection`: docs por `_id` + `ensureIndex(field)` (índice secundario → filtro sin O(N)).
- `DiskVectorStore`: vectores en disco con búsqueda por escaneo streaming.
- **IVF en disco**: `kmeans` determinista + `IVFDiskIndex`; `reindex(nClusters, nProbe)`
  construye, **persiste** (`.ivf` / `.ivfmeta`) y **auto-carga** el índice; la búsqueda lee solo
  los `nProbe` clusters más cercanos.

### Concurrencia (modo disco) — 1 escritor + N lectores
- `SemanticCollection({ path, lock: true })`: escritor único (segundo escritor vivo → falla;
  lock huérfano → lo roba).
- `SemanticCollection.refresh()`: un lector ya abierto ve escrituras nuevas sin reabrir.

### Metodología y tooling
- **KDD** (OKF + CCDD): nodos de conocimiento en `knowledge/`, contratos con tests congelados,
  gate determinista de complejidad. Validadores en `scripts/` (contratos + OKF).
- CI en GitHub Actions (Python + Node 22); badge en el README.

### Límites conocidos
- **No** hay multi-escritor, SQL/joins/relacional, ni ACID-en-disco (las transacciones son del
  modo memoria). El IVF es **aproximado** salvo `nProbe ≥ nClusters`; `reindex` entrena con una
  muestra acotada. `refresh()` no reconstruye los índices de `ensureIndex`.

[0.1.0]: https://github.com/MauricioPerera/js-store/releases/tag/v0.1.0
