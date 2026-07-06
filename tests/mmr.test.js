// Tests CONGELADOS (oráculo) del contrato mmr — task DURA del A/B v1(GLM) vs v2(Haiku).
// MMR: selección greedy que balancea relevancia (score) y diversidad (1 - sim al ya elegido).
// Autorados por el PM (constante para ambos brazos); no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mmr } = require("../src/mmr.js");

// a y b son idénticos en vector (muy similares); c es ortogonal (diverso).
const C = [
  { id: "a", score: 0.9, vector: [1, 0, 0] },
  { id: "b", score: 0.85, vector: [1, 0, 0] },
  { id: "c", score: 0.8, vector: [0, 0, 1] },
];

test("candidatos vacíos => []", () => {
  assert.deepEqual(mmr([], { k: 3, lambda: 0.5 }), []);
});

test("k = 0 => []", () => {
  assert.deepEqual(mmr(C, { k: 0, lambda: 0.5 }), []);
});

test("k negativo => []", () => {
  assert.deepEqual(mmr(C, { k: -2, lambda: 0.5 }), []);
});

test("lambda = 1 (pura relevancia): orden por score desc", () => {
  const out = mmr(C, { k: 3, lambda: 1 });
  assert.deepEqual(out.map((x) => x.id), ["a", "b", "c"]);
});

test("ANTI-DEGRADACIÓN lambda = 0 (pura diversidad): tras 'a', elige el más disímil (c), no 'b'", () => {
  // Un impl que solo devuelve top-k por score daría [a, b]. MMR real da [a, c].
  const out = mmr(C, { k: 2, lambda: 0 });
  assert.deepEqual(out.map((x) => x.id), ["a", "c"]);
});

test("k >= n => devuelve todos (n resultados)", () => {
  assert.equal(mmr(C, { k: 10, lambda: 0.5 }).length, 3);
});

test("k >= n con input NO ordenado: el primero es el de mayor score (invariante)", () => {
  // Cierra el gap del oráculo: un atajo que devuelve el orden original viola
  // "el primer elegido es siempre el de mayor score".
  const un = [
    { id: "x", score: 0.5, vector: [1, 0] },
    { id: "y", score: 0.9, vector: [0, 1] },
  ];
  assert.equal(mmr(un, { k: 5, lambda: 0.5 })[0].id, "y");
});

test("cada resultado conserva id y score", () => {
  const out = mmr(C, { k: 1, lambda: 0.5 });
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "a");
  assert.equal(out[0].score, 0.9);
});

test("no repite candidatos (selección sin reemplazo)", () => {
  const out = mmr(C, { k: 3, lambda: 0.5 });
  const ids = out.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("lambda balanceado prioriza el primero por relevancia", () => {
  // El primer elegido siempre es el de mayor score (no hay 'ya elegidos' que penalicen).
  const out = mmr(C, { k: 1, lambda: 0.5 });
  assert.equal(out[0].id, "a");
});
