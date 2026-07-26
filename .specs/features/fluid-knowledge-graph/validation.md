# Fluid Knowledge Graph Validation — Baseline pré-correção

**Data**: 2026-07-25  
**Spec**: `.specs/features/fluid-knowledge-graph/spec.md`  
**Diff auditado**: `42ac0db..b3766aa`  
**Verificador**: subagente independente (autor != verificador)  
**Natureza**: snapshot de evidências anterior às correções; relatório não commitado

## Veredito

**FAIL ❌ — não pronto.** Os gates nominais passaram, porém há violações observadas de
convergência/cessação de frames, separação de colisões no limite de 500 nós e
reduced motion durante interações. O sensor de limite máximo de zoom também
sobreviveu, portanto a suíte não discrimina uma regressão do valor literal exigido
pela spec.

## Matriz spec-anchored

| Requisito | Evidência e resultado por critério | Status |
| --- | --- | --- |
| **FG-01 — Native interaction safety** | (1) `KnowledgeGraph.test.tsx:123-145` verifica `down.defaultPrevented`; `desktop-foundation.spec.ts:215-216,308-310,321-328` cobre CSS e seleção vazia após drag/pan. (2) `KnowledgeGraph.test.tsx:70-103,152-153` cobre `pointercancel`, mas não `lostpointercapture`. (3) o E2E arrasta o `circle` (`desktop-foundation.spec.ts:267-278`), não o label. | **❌ GAP** — perda de captura e seleção ao arrastar label sem evidência direta. |
| **FG-02 — Live connected motion** | (1) posição do nó: `KnowledgeGraph.test.tsx:144-145`; E2E `desktop-foundation.spec.ts:299-304`. (2) vizinho reage: `KnowledgeGraph.test.tsx:146-151`; E2E `desktop-foundation.spec.ts:305-307`; mutante spring morto. (3) caso pequeno passa em `forceSimulation.test.ts:61-98`, mas rings de 100/500 nós continuam ativos após `settle(360)`, o ring de 100 permanece ativo por milhares de ticks e o cenário de 500 nós degree-20 termina com **1225 overlaps**. (4) endpoint ausente/coordenações finitas: `forceSimulation.test.ts:100-112`. | **❌ FAIL** — decay/rest e collision separation não se sustentam na escala especificada. |
| **FG-03 — Pan and zoom** | Âncora do cursor: `graphViewport.test.ts:13-33`; pan: `graphViewport.test.ts:45-72`; passo/reset/controle nomeado: `KnowledgeGraph.test.tsx:52-68`; reset E2E: `desktop-foundation.spec.ts:319-320`. O teste de clamp compara contra as próprias constantes exportadas (`graphViewport.test.ts:4-6,36-43`), não contra os literais `0.35` e `4`; o mutante de zoom máximo sobreviveu. | **❌ FAIL (sensor/coverage)** — comportamento nominal passa, mas os bounds literais da spec não estão protegidos. |
| **FG-04 — Frame-budgeted rendering** | Seed determinístico e bounded: `forceSimulation.test.ts:12-33`; criação incremental fora do paint: `KnowledgeGraph.tsx:87-116`; paint imperativo e no máximo uma vez por callback: `KnowledgeGraph.tsx:130-175`. Contudo, `runFrame` solicita outro RAF enquanto `tickGraphSimulation` retorna ativo (`KnowledgeGraph.tsx:165-176`), e os diagnósticos de ring não atingem repouso; `settleGraphSimulation` apenas encerra no teto de 360 (`forceSimulation.ts:312-319`). Não há teste que conte a cessação de RAF. | **❌ FAIL** — FG-04.3 é violado e carece de teste discriminante. |
| **FG-05 — Existing states and accessibility** | Empty state: `KnowledgeGraph.test.tsx:180-187`; controles nomeados: `KnowledgeGraph.test.tsx:52-68`. Reduced motion é consultado somente no mount (`KnowledgeGraph.tsx:204-217`); interações voltam a `scheduleSimulation` sem consultar a preferência (`KnowledgeGraph.tsx:181-190,254-307`). O teste apenas verifica mount sem RAF (`KnowledgeGraph.test.tsx:156-177`). | **❌ FAIL** — reduced motion não é respeitado após interação. |

## Gates registrados

| Gate | Resultado |
| --- | --- |
| Suíte unitária completa | **PASS — 130/130** |
| Testes unitários targeted da feature | **PASS — 13/13** |
| Lint | **PASS** |
| Typecheck | **PASS** |
| Format check | **PASS** |
| Build de produção | **PASS** |
| Chromium targeted | **PASS — 1/1** |
| `git diff --check 42ac0db..b3766aa` | **FAIL** — `.specs/features/fluid-knowledge-graph/spec.md:97: new blank line at EOF.` |

Os comandos pesados não foram repetidos nesta passagem; os resultados acima são as
evidências de execução fornecidas ao verificador. Contagem anterior à feature e
skips não foram informados.

## Discrimination sensor

| Mutação | Superfície | Resultado |
| --- | --- | --- |
| Spring force alterada | `forceSimulation.ts:264-275` | **✅ Killed** |
| Proteção contra native selection alterada | `KnowledgeGraph.tsx:250-258` | **✅ Killed** |
| Limite máximo de zoom alterado | `graphViewport.ts:14-15,41-45` | **❌ Survived** |

**Profundidade**: lightweight, 3 mutações.  
**Resultado**: **2/3 killed — FAIL ❌**.

## Achados priorizados

1. **Blocker — FG-04.3 / FG-02.3:** a simulação não converge em topologias ring de 100 e 500 nós; a de 100 permanece ativa por milhares de ticks. Como o loop agenda novo RAF enquanto `active`, isso pode manter pintura/CPU indefinidamente e contradiz a cessação exigida.
2. **Major — FG-02.3:** o cenário de 500 nós degree-20 conserva **1225 overlaps** após settle, violando collision separation justamente no teto de escala do produto.
3. **Major — FG-05.1:** reduced motion só é respeitado no mount; drag/release reaquecem e agendam animação normalmente.
4. **Major — FG-03.1:** o mutante de zoom máximo sobrevive. Fixar testes nos resultados literais `0.35` e `4` da spec, sem derivar a expectativa das constantes de produção.
5. **Major — FG-01.2/FG-01.3:** faltam casos explícitos de `lostpointercapture` (pan e node) e drag iniciado sobre o label com `window.getSelection()` vazio.
6. **Major — FG-04.3/FG-05.1:** faltam sensores de cessação de RAF após repouso e de interação sob `prefers-reduced-motion`.
7. **Minor — higiene do diff:** remover a linha vazia extra no EOF de `spec.md` para `git diff --check` ficar limpo.

## Lacunas de teste obrigatórias para revalidação

- bounds literais inclusivos `0.35` e `4`;
- cleanup por `lostpointercapture` para pan e node;
- seleção vazia ao iniciar o drag no label;
- número de RAFs deixa de crescer após o repouso;
- drag/release sob reduced motion não inicia sequência animada;
- stress determinístico de 100/500 nós que exige repouso e ausência de overlaps.

## Conclusão

O diff demonstra os fluxos nominais e passa 130 unidades, 13 testes targeted e 1
Chromium targeted, mas essas passagens não anulam as falhas comportamentais e o
mutante sobrevivente. Este documento é deliberadamente um **baseline FAIL
pré-correção**; nenhuma correção de código, lição ou commit foi feita pelo
verificador.
