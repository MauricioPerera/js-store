---
type: 'Task Contract'
title: 'Persistencia a disco de SemanticCollection'
description: 'Añade saveToFile(path)/loadFromFile(path): envoltorio fino sobre serialize/deserialize que escribe y lee un archivo JSON con node:fs.'
tags: ['js-store', 'ccdd', 'semantic', 'persistencia', 'fs']

task: semantic-collection-file
intent: "Volcar SemanticCollection a un archivo JSON en disco reconstruible."
target: src/semantic-collection.js
signature: "saveToFile(path)"
language: javascript
test_command: "node --test tests/semantic-collection-file.test.js"
budget:
  max_cyclomatic_complexity: 10
  max_nesting_depth: 3
tests: tests/semantic-collection-file.test.js
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: semantic-collection-file

## Intent
Persistencia a disco de [`SemanticCollection`](../../src/semantic-collection.js): un
`saveToFile(path)` que escribe el `serialize()` como JSON y un `static loadFromFile(path)`
que lo lee y reconstruye vía `deserialize`. Envoltorio fino sobre la serialización ya
existente. Cambio ADITIVO: el resto de métodos NO cambia. Usa `node:fs` (stdlib, no es
dependencia externa).

## Interface
```js
sc.saveToFile(path) -> path
//   Escribe JSON.stringify(this.serialize()) en `path` (utf8) con fs.writeFileSync.
//   Devuelve `path`.

SemanticCollection.loadFromFile(path) -> SemanticCollection
//   Lee `path` (utf8) con fs.readFileSync, JSON.parse, y SemanticCollection.deserialize.
```

## Invariants
- Round-trip por disco: `loadFromFile(sc.saveToFile(path)==path)` produce una colección cuyo
  `search` (ranking, doc adjunto y filtro) es equivalente al original.
- El archivo escrito es exactamente `JSON.stringify(this.serialize())` (parseado es igual a
  `serialize()`).
- `saveToFile` devuelve `path`.
- La colección cargada es independiente del original.
- Reusa `serialize`/`deserialize` (NO reimplementa el volcado ni el join).
- Solo `node:fs` de stdlib; sin red, sin subprocess. IO síncrono
  (`writeFileSync`/`readFileSync`). No muta la instancia al guardar.

## Examples
- `sc.saveToFile(p)` -> `p`; `SemanticCollection.loadFromFile(p)` -> equivalente a `sc`.
- Colección vacía: round-trip por disco válido, `search` devuelve `[]`.

## Do / Don't
- DO: `require("node:fs")`; `writeFileSync(path, JSON.stringify(this.serialize()), "utf8")`.
- DO: en `loadFromFile`, `deserialize(JSON.parse(readFileSync(path, "utf8")))`.
- DON'T: reimplementar serialize/deserialize; usar red/subprocess; IO asíncrono.
- DON'T: tocar `tests/`, `knowledge/`, `src/vendor/`, `src/hybrid-merge.js`, `scripts/`.

## Tests
(Congelados en `tests/semantic-collection-file.test.js`; escriben a un tmpdir. La suite
completa debe seguir verde: es regresión.)

## Constraints
- PARAR y reportar si... `node:fs` no estuviera disponible o el round-trip exigiera cambiar
  serialize/deserialize; documentar el porqué y responder BLOQUEADO.
