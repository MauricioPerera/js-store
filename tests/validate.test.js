'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateInput } = require('../src/validate.js');

test('caso valido: sin violaciones', () => {
  const result = validateInput('a', {}, [1, 2], 2);
  assert.deepEqual(result, []);
});

test('id ausente (undefined) -> violacion de id', () => {
  const result = validateInput(undefined, {}, [1, 2], 2);
  assert.equal(result.some((m) => /id/i.test(m)), true);
});

test('id vacio -> violacion de id', () => {
  const result = validateInput('', {}, [1, 2], 2);
  assert.equal(result.some((m) => /id/i.test(m)), true);
});

test('id numerico -> violacion de id', () => {
  const result = validateInput(123, {}, [1, 2], 2);
  assert.equal(result.some((m) => /id/i.test(m)), true);
});

test('doc null -> violacion de doc', () => {
  const result = validateInput('a', null, [1, 2], 2);
  assert.equal(result.some((m) => /doc/i.test(m)), true);
});

test('doc array -> violacion de doc', () => {
  const result = validateInput('a', [1, 2], [1, 2], 2);
  assert.equal(result.some((m) => /doc/i.test(m)), true);
});

test('doc no-objeto (string) -> violacion de doc', () => {
  const result = validateInput('a', 'not-an-object', [1, 2], 2);
  assert.equal(result.some((m) => /doc/i.test(m)), true);
});

test('vector no-array -> violacion de vector', () => {
  const result = validateInput('a', {}, 'not-a-vector', 2);
  assert.equal(result.some((m) => /vector/i.test(m)), true);
});

test('vector longitud incorrecta -> violacion de vector', () => {
  const result = validateInput('a', {}, [1, 2, 3], 2);
  assert.equal(result.some((m) => /vector/i.test(m)), true);
});

test('vector con NaN -> violacion de vector', () => {
  const result = validateInput('a', {}, [1, NaN], 2);
  assert.equal(result.some((m) => /vector/i.test(m)), true);
});

test('vector con Infinity -> violacion de vector', () => {
  const result = validateInput('a', {}, [1, Infinity], 2);
  assert.equal(result.some((m) => /vector/i.test(m)), true);
});

test('vector con -Infinity -> violacion de vector', () => {
  const result = validateInput('a', {}, [-Infinity, 1], 2);
  assert.equal(result.some((m) => /vector/i.test(m)), true);
});

test('vector con elemento no-numero -> violacion de vector', () => {
  const result = validateInput('a', {}, [1, 'x'], 2);
  assert.equal(result.some((m) => /vector/i.test(m)), true);
});

test('acumulacion: id, doc y vector invalidos a la vez -> 3 violaciones distintas', () => {
  const result = validateInput(123, null, [1, NaN], 2);
  assert.equal(result.length, 3);
  assert.equal(result.some((m) => /id/i.test(m)), true);
  assert.equal(result.some((m) => /doc/i.test(m)), true);
  assert.equal(result.some((m) => /vector/i.test(m)), true);
});

test('acumulacion: doc array (doc invalido) + vector longitud incorrecta', () => {
  const result = validateInput('a', [1, 2], [1, 2, 3], 2);
  assert.equal(result.length, 2);
});

test('input totalmente arbitrario no debe lanzar (objeto raro)', () => {
  assert.doesNotThrow(() => {
    validateInput({ weird: true }, Symbol('x'), { not: 'array' }, 2);
  });
});

test('input totalmente arbitrario no debe lanzar (funcion, null, undefined)', () => {
  assert.doesNotThrow(() => {
    validateInput(() => {}, undefined, null, 2);
  });
});

test('input totalmente arbitrario no debe lanzar (referencia circular en doc)', () => {
  const circular = {};
  circular.self = circular;
  assert.doesNotThrow(() => {
    validateInput('a', circular, [1, 2], 2);
  });
});

test('no muta los argumentos recibidos', () => {
  const doc = { x: 1 };
  const vector = [1, 2];
  validateInput('a', doc, vector, 2);
  assert.deepEqual(doc, { x: 1 });
  assert.deepEqual(vector, [1, 2]);
});

test('caso valido con dim distinto', () => {
  const result = validateInput('id-1', { k: 'v' }, [0.1, 0.2, 0.3], 3);
  assert.deepEqual(result, []);
});
