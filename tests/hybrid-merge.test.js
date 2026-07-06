// Tests CONGELADOS (oráculo) del contrato hybrid-merge.
// Autorados por el PM ANTES de delegar. El implementador NO los edita.
// Independientes: solo consumen la API pública hybridMerge(vectorHits, allowedIds, limit).

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { hybridMerge } = require("../src/hybrid-merge.js");

const hits = [
  { id: "a", score: 0.9 },
  { id: "b", score: 0.8 },
  { id: "c", score: 0.7 },
  { id: "d", score: 0.6 },
];

test("allowedIds null => todos, en orden de entrada", () => {
  assert.deepEqual(hybridMerge(hits, null), hits);
});

test("allowedIds undefined => todos", () => {
  assert.deepEqual(hybridMerge(hits, undefined), hits);
});

test("filtra por Set preservando el orden de vectorHits", () => {
  const out = hybridMerge(hits, new Set(["c", "a"]));
  assert.deepEqual(out.map((h) => h.id), ["a", "c"]);
});

test("filtra por array (membership)", () => {
  const out = hybridMerge(hits, ["b", "d"]);
  assert.deepEqual(out.map((h) => h.id), ["b", "d"]);
});

test("allowedIds vacío (Set o array) => []", () => {
  assert.deepEqual(hybridMerge(hits, new Set()), []);
  assert.deepEqual(hybridMerge(hits, []), []);
});

test("limit trunca DESPUÉS de filtrar", () => {
  assert.deepEqual(hybridMerge(hits, null, 2).map((h) => h.id), ["a", "b"]);
});

test("limit mayor que resultados => todos los que pasan", () => {
  assert.equal(hybridMerge(hits, new Set(["a"]), 10).length, 1);
});

test("limit 0 => []", () => {
  assert.deepEqual(hybridMerge(hits, null, 0), []);
});

test("limit negativo => [] (tratado como 0)", () => {
  assert.deepEqual(hybridMerge(hits, null, -3), []);
});

test("limit no finito (NaN/undefined) => sin límite", () => {
  assert.equal(hybridMerge(hits, null, NaN).length, 4);
  assert.equal(hybridMerge(hits, null).length, 4);
});

test("filtro + limit combinados", () => {
  const out = hybridMerge(hits, new Set(["b", "c", "d"]), 2);
  assert.deepEqual(out.map((h) => h.id), ["b", "c"]);
});

test("preserva las referencias de los objetos hit (no clona)", () => {
  const out = hybridMerge(hits, new Set(["a"]));
  assert.equal(out[0], hits[0]);
});

test("es pura: no muta vectorHits", () => {
  const snapshot = hits.map((h) => ({ ...h }));
  hybridMerge(hits, new Set(["a"]), 1);
  assert.deepEqual(hits, snapshot);
});

test("devuelve un array NUEVO (no la misma referencia de entrada)", () => {
  const out = hybridMerge(hits, null);
  assert.notEqual(out, hits);
});

test("vectorHits no-array => [] (nunca lanza)", () => {
  assert.deepEqual(hybridMerge(null, null), []);
  assert.deepEqual(hybridMerge(undefined, new Set(["a"])), []);
  assert.deepEqual(hybridMerge(42, ["a"]), []);
});

test("ids duplicados se conservan (sin dedupe), en orden", () => {
  const dup = [
    { id: "a", score: 1 },
    { id: "a", score: 0.5 },
    { id: "b", score: 0.4 },
  ];
  assert.deepEqual(hybridMerge(dup, new Set(["a"])).map((h) => h.score), [1, 0.5]);
});

test("ids numéricos con Set (SameValueZero)", () => {
  const nh = [
    { id: 1, score: 1 },
    { id: 2, score: 0.5 },
  ];
  assert.deepEqual(hybridMerge(nh, new Set([2])).map((h) => h.id), [2]);
});
