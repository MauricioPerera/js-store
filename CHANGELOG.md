# Changelog

Todas las versiones notables de **js-store**. Formato basado en
[Keep a Changelog](https://keepachangelog.com/); versionado [SemVer](https://semver.org/).

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
