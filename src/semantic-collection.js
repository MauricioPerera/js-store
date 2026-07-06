// Target del contrato: knowledge/contracts/semantic-collection.md
// Colección semántica doc+vector: envuelve un core documental y uno vectorial
// (inyectados), expone upsert + search fusionando con hybridMerge.

const { hybridMerge } = require("./hybrid-merge.js");
const { matchFilter } = require("./vendor/js-doc-store.js");

const DEFAULT_COL = "default";
const DEFAULT_LIMIT = 5;

// over-fetch suficiente para no perder recall tras filtrar.
function resolveOverFetch(limit, overFetch) {
  if (overFetch != null) return overFetch;
  return Math.max(limit * 10, 100);
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
  constructor({ vectorStore, docCollection, col } = {}) {
    this.vectorStore = vectorStore;
    this.docCollection = docCollection;
    this.col = col == null ? DEFAULT_COL : col;
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
}

module.exports = { SemanticCollection };