// Target del contrato: knowledge/contracts/semantic-collection.md
// Colección semántica doc+vector: envuelve un core documental y uno vectorial
// (inyectados), expone upsert + search fusionando con hybridMerge.

const { hybridMerge } = require("./hybrid-merge.js");
const { matchFilter } = require("./vendor/js-doc-store.js");

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

class SemanticCollection {
  constructor({ vectorStore, docCollection, col, dim } = {}) {
    this.col = col == null ? DEFAULT_COL : col;
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

  upsert(id, doc, vector) {
    this.vectorStore.set(this.col, id, vector);
    this.docCollection.remove({ _id: id });
    this.docCollection.insert({ ...doc, _id: id });
    return id;
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

  // Borrado: quita el registro de ambos cores. Devuelve true si el doc existía.
  // Contrato: knowledge/contracts/semantic-collection-delete.md
  delete(id) {
    const removed = this.docCollection.remove({ _id: id });
    this.vectorStore.remove(this.col, id);
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
}

module.exports = { SemanticCollection };