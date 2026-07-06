// Target del contrato: knowledge/contracts/semantic-collection.md
// Colección semántica doc+vector: envuelve un core documental y uno vectorial
// (inyectados), expone upsert + search fusionando con hybridMerge.

const fs = require("node:fs");
const { hybridMerge } = require("./hybrid-merge.js");
const { matchFilter } = require("./vendor/js-doc-store.js");
const { BM25Index, HybridSearch } = require("./vendor/js-vector-store.js");
const { appendOp, readOps } = require("./wal.js");
const { acquireLock, releaseLock } = require("./lock.js");
const { validateInput } = require("./validate.js");

const DEFAULT_COL = "default";
const DEFAULT_LIMIT = 5;
const DEFAULT_DIM = 768;

// over-fetch suficiente para no perder recall tras filtrar.
function resolveOverFetch(limit, overFetch) {
  if (overFetch != null) return overFetch;
  return Math.max(limit * 10, 100);
}

// Record de persistencia: une un doc (con _id) con su vector plano.
function recordFromDoc(sc, doc) {
  const id = doc._id;
  const vector = sc.vectorStore.get(sc.col, id).vector;
  return { id, doc, vector };
}

// Set de ids candidatos cuyo doc existe y matchea el filter. null = sin filtro.
function buildAllowedIds(docCollection, candidates, filter) {
  if (filter == null) return null;
  const allowed = new Set();
  for (const hit of candidates) {
    if (hit == null) continue;
    const doc = docCollection.findById(hit.id);
    if (doc != null && matchFilter(doc, filter)) allowed.add(hit.id);
  }
  return allowed;
}

// Construye un BM25Index al vuelo desde los docs de la colección (rebuild-at-query).
// No se mantiene en el estado: se reconstruye por cada llamada a searchHybrid.
function buildBM25(docCollection, col, textField) {
  const bm25 = new BM25Index();
  for (const doc of docCollection.export()) {
    const text = String(doc[textField] != null ? doc[textField] : "");
    bm25.addDocument(col, doc._id, text);
  }
  return bm25;
}

class SemanticCollection {
  constructor({ vectorStore, docCollection, col, dim, walPath } = {}) {
    this.col = col == null ? DEFAULT_COL : col;
    this.walPath = walPath == null ? null : walPath;
    this._tx = null;
    if (vectorStore != null) {
      // Modo INYECCIÓN (existente, sin cambios).
      this.vectorStore = vectorStore;
      this.docCollection = docCollection;
      return;
    }
    // Modo CONVENIENCIA: arma sus propios cores en memoria.
    const { VectorStore, MemoryStorageAdapter } = require("./vendor/js-vector-store.js");
    const { DocStore, MemoryStorageAdapter: DocMemAdapter } = require("./vendor/js-doc-store.js");
    const resolvedDim = dim == null ? DEFAULT_DIM : dim;
    this.vectorStore = new VectorStore(new MemoryStorageAdapter(), resolvedDim);
    this.docCollection = new DocStore(new DocMemAdapter()).collection(this.col);
  }

  // Journaling: dentro de una tx difiere al buffer; fuera anexa al WAL (sin tx, idéntico a antes).
  _record(op) {
    if (this._tx) this._tx.ops.push(op);
    else if (this.walPath) appendOp(this.walPath, op);
  }

  upsert(id, doc, vector) {
    const errors = validateInput(id, doc, vector, this.vectorStore.dim);
    if (errors.length > 0) {
      throw new Error("upsert: entrada invalida: " + errors.join("; "));
    }
    this.vectorStore.set(this.col, id, vector);
    this.docCollection.remove({ _id: id });
    this.docCollection.insert({ ...doc, _id: id });
    this._record({ op: "upsert", id, doc, vector });
    return id;
  }

  // Inserción batch: reusa upsert por item. Contrato: semantic-collection-upsertmany.md
  upsertMany(items) {
    return items.map((it) => this.upsert(it.id, it.doc, it.vector));
  }

  search(queryVector, options = {}) {
    const filter = options.filter == null ? null : options.filter;
    const limit = options.limit == null ? DEFAULT_LIMIT : options.limit;
    const overFetch = resolveOverFetch(limit, options.overFetch);

    const candidates = this.vectorStore.search(this.col, queryVector, overFetch);
    const allowedIds = buildAllowedIds(this.docCollection, candidates, filter);
    const merged = hybridMerge(candidates, allowedIds, limit);

    return merged.map((h) => ({
      id: h.id,
      score: h.score,
      doc: this.docCollection.findById(h.id),
    }));
  }

  // Búsqueda híbrida texto+vector: fusiona similitud vectorial + BM25 (HybridSearch)
  // y aplica el filtro documental. Contrato: semantic-collection-hybrid.md
  searchHybrid(queryVector, queryText, options = {}) {
    const filter = options.filter == null ? null : options.filter;
    const limit = options.limit == null ? DEFAULT_LIMIT : options.limit;
    const textField = options.textField == null ? "text" : options.textField;
    const mode = options.mode == null ? "rrf" : options.mode;
    const overFetch = resolveOverFetch(limit, options.overFetch);

    const bm25 = buildBM25(this.docCollection, this.col, textField);
    const candidates = new HybridSearch(this.vectorStore, bm25, mode).search(
      this.col, queryVector, queryText, overFetch, options
    );
    const allowedIds = buildAllowedIds(this.docCollection, candidates, filter);
    const merged = hybridMerge(candidates, allowedIds, limit);

    return merged.map((h) => ({
      id: h.id,
      score: h.score,
      doc: this.docCollection.findById(h.id),
    }));
  }

  // Lecturas directas: delegan en el core documental. Contrato: semantic-collection-reads.md
  get(id) {
    return this.docCollection.findById(id);
  }

  count(filter) {
    return this.docCollection.count(filter);
  }

  // Borrado: quita el registro de ambos cores. Devuelve true si el doc existía.
  // Contrato: knowledge/contracts/semantic-collection-delete.md
  delete(id) {
    const removed = this.docCollection.remove({ _id: id });
    this.vectorStore.remove(this.col, id);
    this._record({ op: "delete", id });
    return removed > 0;
  }

  // Persistencia: Contrato knowledge/contracts/semantic-collection-persist.md
  // Volcado a objeto plano JSON (sin binario) y reconstrucción vía upsert.
  serialize() {
    const docs = this.docCollection.export();
    const records = docs.map((doc) => recordFromDoc(this, doc));
    return { col: this.col, dim: this.vectorStore.dim, records };
  }

  static deserialize(data) {
    const sc = new SemanticCollection({ dim: data.dim, col: data.col });
    for (const r of data.records) sc.upsert(r.id, r.doc, r.vector);
    return sc;
  }

  // Persistencia a disco (node:fs): envoltorio síncrono sobre serialize/deserialize.
  // Contrato: knowledge/contracts/semantic-collection-file.md
  saveToFile(path) {
    const data = JSON.stringify(this.serialize());
    const tmp = path + ".tmp";
    const fd = fs.openSync(tmp, "w");
    try {
      fs.writeFileSync(fd, data, "utf8");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, path);
    return path;
  }

  static loadFromFile(path) {
    const raw = fs.readFileSync(path, "utf8");
    return SemanticCollection.deserialize(JSON.parse(raw));
  }

  // Durabilidad B2b: apertura con recuperación (snapshot + replay WAL) y checkpoint.
  // Contrato: knowledge/contracts/semantic-collection-durable.md
  static openDurable({ path, walPath, dim, col, lockPath } = {}) {
    // 0. Lock de un solo escritor (opt-in): PRIMER paso. Lanza si otro proceso VIVO
    //    lo tiene; roba un lock stale de proceso muerto (vía acquireLock).
    if (lockPath != null) acquireLock(lockPath);
    // 1. Estado base: si el snapshot existe, deserializa; si no, colección nueva.
    let sc;
    if (path != null && fs.existsSync(path)) {
      sc = SemanticCollection.deserialize(JSON.parse(fs.readFileSync(path, "utf8")));
    } else {
      sc = new SemanticCollection({ dim, col });
    }
    // 2. Replay del WAL SIN journalizar (sc.walPath sigue null en este punto).
    for (const op of readOps(walPath)) {
      if (op.op === "upsert") sc.upsert(op.id, op.doc, op.vector);
      else if (op.op === "delete") sc.delete(op.id);
    }
    // 3. Activar durabilidad para las mutaciones POSTERIORES.
    sc.snapshotPath = path == null ? null : path;
    sc.walPath = walPath == null ? null : walPath;
    sc._lockPath = lockPath == null ? null : lockPath;
    return sc;
  }

  checkpoint() {
    // Snapshot atómico primero, luego truncar el WAL (crash entre ambos = replay idempotente).
    this.saveToFile(this.snapshotPath);
    fs.writeFileSync(this.walPath, "");
    return this.snapshotPath;
  }

  // Transacciones (Fase C): STUBS — los implementa el desarrollador (GLM).
  // Contrato: knowledge/contracts/semantic-collection-tx.md
  begin() {
    if (this._tx) throw new Error("transaccion ya activa");
    this._tx = { snapshot: this.serialize(), ops: [] };
  }

  commit() {
    if (!this._tx) throw new Error("no hay transaccion activa");
    if (this.walPath) {
      for (const op of this._tx.ops) appendOp(this.walPath, op);
    }
    this._tx = null;
  }

  rollback() {
    if (!this._tx) throw new Error("no hay transaccion activa");
    const restored = SemanticCollection.deserialize(this._tx.snapshot);
    this.vectorStore = restored.vectorStore;
    this.docCollection = restored.docCollection;
    this._tx = null;
  }

  // Lock de un solo escritor (Fase D2): libera el lock si la colección lo tomó.
  // Contrato: knowledge/contracts/semantic-collection-lock.md
  close() {
    if (this._lockPath) {
      releaseLock(this._lockPath);
      this._lockPath = null;
    }
  }
}

module.exports = { SemanticCollection };