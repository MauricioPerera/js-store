# Reporte A/B — PM v1 (GLM/Ollama) vs v2 (sub-agentes nativos)

Tres experimentos A/B midiendo dos variantes del flujo **PM + CCDD** para delegar la
implementación de código, usando el **gate CCDD como juez determinista** y el proyecto
**js-store** como banco de pruebas. El PM (quien autora contrato + tests congelados) se
mantuvo **constante** en cada A/B; la única variable fue el **tier/mecanismo del dev**.

- **v1** — skill `pm-glm-ccdd`: dev = instancia efímera de `glm-5.2:cloud` vía `ollama launch`.
- **v2** — skill `pm-native-ccdd`: dev = sub-agente nativo (`Agent`, `model:"haiku"`), con
  `isolation:"worktree"` para paralelo y `SendMessage` para reintentos con contexto.

Metodología por tarea: autorar contrato + **tests congelados** (oráculo) → `lint_task_contract`
→ baseline rojo → delegar la MISMA impl a cada dev → verificar por artefacto (re-correr tests +
`measure_complexity`). Métricas: correctitud, veredicto del gate, re-delegaciones, wall-clock y
—cuando es medible— tokens del dev.

> **Nota de medición:** los tokens de v2 (sub-agente) los reporta el harness de forma exacta;
> los de v1 (GLM) son de un **pool externo**, opacos a esta sesión. La comparación de costo es
> por eso asimétrica y se interpreta cualitativamente.

---

## A/B #1 — Tarea fácil: `keys()` (lista de ids)

| | v1 (GLM) | v2 (Haiku nativo) |
|---|---|---|
| Tests congelados | ✅ 5/5 | ✅ 5/5 |
| Impl producida | `export().map(d=>d._id)` | **idéntica, byte a byte** |
| Gate (complejidad) | sin violaciones | sin violaciones |
| Re-delegaciones | 0 | 0 |
| Wall-clock | 32 s | 27 s |
| Tokens dev | externo/opaco | 36 799 (medido) |

**Resultado: empate.** Tarea trivial; cualquier tier competente la clava. No diferencia calidad.

---

## A/B #2 — Tarea dura: `mmr()` (Maximal Marginal Relevance)

Algoritmo greedy con similitud por pares, budget ajustado (cyclomatic ≤ 10, nesting ≤ 3) y
**oráculo adversarial** (discriminador `lambda=0` de diversidad real vs top-k por score).

| | v1 (GLM) | v2 (Haiku nativo) |
|---|---|---|
| 1er intento: tests congelados | ✅ 9/9 | ✅ 9/9 |
| 1er intento: **correctitud real** | ✅ MMR general correcto | ❌ atajo `k>=n` viola invariante |
| 1er intento: **complejidad** | ✅ cyclo 10/10 | ❌ cyclo 11 > 10 (ALTA) |
| Re-delegaciones | 0 | 1 (vía `SendMessage`) |
| Resultado final | correcto | correcto tras 1 retry (cyclo 9) |
| Wall-clock | 39 s | 37 s + 46 s (retry) ≈ 83 s |
| Tokens dev | externo/opaco | ~43,5k acum. (medido) |

**Hallazgos:**
1. **GLM ganó el 1er intento** en la tarea dura (n=1): impl correcta y en budget; Haiku tomó un
   atajo `k>=n` que devolvía el orden original, violando el invariante *"el primer elegido es
   siempre el de mayor score"*, **y** excedía el budget de complejidad.
2. **El retry por `SendMessage` (v2) se lució**: como el agente conservaba todo su contexto, el
   feedback fue un delta pequeño y el fix fue quirúrgico (4 tool-uses). En v1 un retry
   **relanza GLM re-enviando toda la spec** (dev sin memoria).
3. **Lección mayor — el oráculo:** el bug de Haiku pasó los tests congelados por un **gap** del
   oráculo (el caso `k>=n` chequeaba `.length`, no el orden). El gate de **complejidad** lo cazó
   igual (redundancia), y al endurecer el oráculo se cerró el gap. *El gate es tan bueno como su
   oráculo + sus métricas.*

---

## A/B #3 — Paralelismo: `l2()` + `manhattan()` (2 devs en paralelo)

Dos tareas independientes (archivos distintos), una por dev, en paralelo.

| | v1 (2 GLM) | v2 (2 Haiku nativos) |
|---|---|---|
| Resultado | ✅ 8/8 | ✅ 8/8 |
| **Worktree (aislamiento)** | n/a | ❌ **FALLÓ** — "not in a git repository" |
| Arranque concurrente | escalonado **+30 s** (obligado) | **una tanda, sin escalonar** |
| Wall-clock | 68 s (incl. stagger) | ≈ 26 s (concurrentes) |
| Tokens dev | externo/opaco | 64,4k medidos (32,3k + 32,1k) |

**Hallazgo central — el worktree no funcionó:** la ventaja estrella de v2
(`isolation:"worktree"`) **estaba indisponible en esta sesión**: el harness detectó el cwd como
**no-git al arrancar** (el `git init` posterior no cuenta). Requiere que la sesión **arranque**
en un repo git reconocido, o hooks `WorktreeCreate` en `settings.json`. v2 cayó a paralelo **sin
aislamiento** (funcionó porque los archivos eran distintos).

**Interpretación:**
- **v2 fue ~2,6× más rápido** (26 s vs 68 s), sobre todo porque v1 **debe escalonar** los
  arranques (regla de la skill para evitar el error "Could not verify your plan"). Ese stagger es
  fragilidad real de v1; v2 no lo necesita.
- Para trabajo paralelo que **colisiona** (mismo archivo), v2 aquí **no tendría** su ventaja de
  aislamiento → habría que arrancar la sesión dentro del repo git o configurar los hooks.

---

## Conclusiones transversales

1. **La calidad la sostiene el sistema, no el tier del dev.** En los tres A/B, el **gate + oráculo
   endurecido** cazaron cualquier degradación (complejidad y/o correctitud), independientemente de
   quién implementara. La inversión de mayor retorno es **el oráculo** (tests congelados +
   red-team del HECHO), no elegir el dev más caro.
2. **v2 (nativa) gana en ergonomía**: arranque sin fragilidad, **retry quirúrgico con contexto**
   (`SendMessage`) y **medición exacta de costo**. Su diferenciador estrella (worktree) exige una
   **precondición** (sesión arrancada en repo git) que aquí no se cumplió — verificar disponibilidad
   antes de confiar en él.
3. **v1 (GLM) sigue válida** cuando conviene **descargar el costo del dev a un pool externo**
   fuera del presupuesto de la sesión.
4. **n pequeño.** Estos son 3 experimentos de una tarea cada uno; señalan tendencias, no
   veredictos estadísticos. El propio gate es el juez y hace el A/B **barato de repetir**.

## Recomendación

- **Patrón conocido / bajo riesgo:** cualquiera de las dos; preferir **v2** por ergonomía y
  medición, o **v1** para no gastar tokens de sesión.
- **Alto riesgo / novedoso:** invertir en el **oráculo** (discriminadores adversariales) y correr
  el gate — ahí está el 80% de la calidad.
- **Paralelo con colisión real:** usar **v2 con worktree**, pero **arrancar la sesión dentro del
  repo git** (o configurar `WorktreeCreate`), y verificar que el worktree esté disponible.

_Tareas del reporte commiteadas en el repo: `keys`, `mmr`, `metric-l2`, `metric-manhattan`
(con sus contratos y tests congelados). Skills: `pm-glm-ccdd` (v1), `pm-native-ccdd` (v2)._
