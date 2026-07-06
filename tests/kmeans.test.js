// Tests CONGELADOS (oráculo) del contrato kmeans (fase 3b-i).
// Determinista: init = primeros k vectores + Lloyd. Autorados por el PM; no editar.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { kmeans } = require("../src/kmeans.js");

test("vectores vacíos => { centroids: [], assignments: [] }", () => {
  assert.deepEqual(kmeans([], 2, 10), { centroids: [], assignments: [] });
});

test("k = 1: un centroide (media de todos), todas las asignaciones 0", () => {
  const out = kmeans([[0, 0], [2, 0], [4, 0]], 1, 10);
  assert.deepEqual(out.assignments, [0, 0, 0]);
  assert.deepEqual(out.centroids, [[2, 0]]);
});

test("dos grupos bien separados, k=2: asignaciones correctas y deterministas", () => {
  // init = primeros 2 = [0,0],[0,1]; converge a {0,1}|{2,3}.
  const out = kmeans([[0, 0], [0, 1], [10, 10], [10, 11]], 2, 20);
  assert.deepEqual(out.assignments, [0, 0, 1, 1]);
  assert.equal(out.centroids.length, 2);
});

test("k >= n: cada vector es su propio cluster", () => {
  const out = kmeans([[0, 0], [5, 5]], 5, 10);
  assert.deepEqual(out.assignments, [0, 1]);
  assert.deepEqual(out.centroids, [[0, 0], [5, 5]]);
});

test("el primer vector siempre queda en el cluster 0 (init determinista)", () => {
  const out = kmeans([[1, 1], [2, 2], [3, 3]], 2, 10);
  assert.equal(out.assignments[0], 0);
});

test("cada asignación es un índice de cluster válido (0..k-1) y hay una por vector", () => {
  const vs = [[0, 0], [1, 0], [9, 9], [8, 9], [9, 8]];
  const out = kmeans(vs, 2, 10);
  assert.equal(out.assignments.length, vs.length);
  assert.ok(out.assignments.every((a) => a >= 0 && a < 2));
});

test("determinismo: dos corridas idénticas dan el mismo resultado", () => {
  const vs = [[0, 0], [0, 1], [10, 10], [10, 11], [5, 5]];
  assert.deepEqual(kmeans(vs, 2, 20), kmeans(vs, 2, 20));
});
