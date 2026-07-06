// Smoke test del scaffold. Confirma que `node --test` está cableado y que el
// módulo público carga. Los tests reales de cada función se congelan en su
// contrato CCDD antes de delegar la implementación.

import { test } from "node:test";
import assert from "node:assert/strict";
import { VERSION } from "../src/index.js";

test("el módulo público expone una versión string", () => {
  assert.equal(typeof VERSION, "string");
});
