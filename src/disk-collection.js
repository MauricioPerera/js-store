// Colección de documentos DURABLE en disco: los documentos viven en un DiskKV (por _id) y se
// leen bajo demanda; nunca se retiene el dataset completo en RAM. Fase 2 del motor en disco.
// Contrato: knowledge/contracts/disk-collection.md

const { DiskKV } = require("./disk-kv.js");
const { matchFilter } = require("./vendor/js-doc-store.js");

class DiskCollection {
  constructor(dataPath) {
    this._kv = new DiskKV(dataPath);
    this._counter = 0;
  }

  insert(doc) {
    const d = { ...doc };
    if (d._id === undefined || d._id === null) {
      d._id = String(Date.now()) + "_" + this._counter++;
    }
    this._kv.put(d._id, d);
    return d;
  }

  findById(id) {
    return this._kv.get(id);
  }

  // Escanea los ids en disco leyendo de a uno (sin cargar todo a RAM) y aplica `cb`
  // por cada documento que matchea el filtro. `cb` recibe (id, doc) y puede devolver
  // false para detener el escaneo. Normaliza filter vacio/undefined a "matchea todo".
  _scan(filter, cb) {
    const ids = this._kv.keys();
    for (const id of ids) {
      const doc = this._kv.get(id);
      if (matchFilter(doc, filter) && cb(id, doc) === false) break;
    }
  }

  find(filter) {
    const out = [];
    this._scan(filter, (_id, doc) => { out.push(doc); });
    return out;
  }

  count(filter) {
    let n = 0;
    this._scan(filter, () => { n++; });
    return n;
  }

  remove(filter) {
    let removed = 0;
    const toDelete = [];
    this._scan(filter, (id) => { toDelete.push(id); });
    for (const id of toDelete) {
      this._kv.delete(id);
      removed++;
    }
    return removed;
  }
}

module.exports = { DiskCollection };