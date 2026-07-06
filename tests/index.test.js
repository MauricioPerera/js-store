// Smoke test del scaffold de integración (CommonJS). Confirma que la fachada carga y
// reexpone los dos cores vendorizados. Los tests reales de cada función integradora se
// congelan en su contrato CCDD antes de delegar la implementación.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const store = require("../src/index.js");

test("la fachada expone una versión string", () => {
  assert.equal(typeof store.VERSION, "string");
});

test("reexpone el core de documentos (DocStore)", () => {
  assert.equal(typeof store.doc.DocStore, "function");
});

test("reexpone el core vectorial (VectorStore)", () => {
  assert.equal(typeof store.vector.VectorStore, "function");
});

test("expone la API de integración (SemanticCollection)", () => {
  assert.equal(typeof store.SemanticCollection, "function");
});
