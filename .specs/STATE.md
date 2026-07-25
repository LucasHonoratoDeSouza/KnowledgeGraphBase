# STATE

## Decisions

### AD-001
- **Decision**: O produto primário será Tauri 2 + React/TypeScript, com todo acesso privilegiado e domínio local no runtime Rust.
- **Reason**: Mantém o aplicativo nativo, local-first, pequeno e com uma fronteira IPC/capabilities explícita.
- **Trade-off**: Exige competência e testes em Rust e TypeScript.
- **Scope**: desktop, armazenamento local, ingestão, recuperação e segurança
- **Date**: 2026-07-24
- **Status**: active

### AD-002
- **Decision**: Markdown no vault é o formato canônico durável; SQLite armazena metadados, estado, FTS5, grafo e índices reconstruíveis.
- **Reason**: Preserva portabilidade e uso offline sem transformar o banco em fonte proprietária única.
- **Trade-off**: Escritas arquivo+banco exigem staging, recuperação e verificadores de consistência.
- **Scope**: todos os modelos e pipelines de conhecimento
- **Date**: 2026-07-24
- **Status**: active

### AD-003
- **Decision**: O repositório será um monorepo poliglota com workspaces pnpm, Cargo e uv; o core local fica em crates Rust e API/worker Python permanecem opcionais.
- **Reason**: Compartilha contratos e gates sem colocar um sidecar Python no aplicativo desktop.
- **Trade-off**: A automação raiz precisa orquestrar três ecossistemas.
- **Scope**: organização do repositório, builds, testes e releases
- **Date**: 2026-07-24
- **Status**: active

### AD-004
- **Decision**: Código de produto usará um contrato interno de IA; LiteLLM Proxy será o gateway recomendado para multi-provider, com HTTP OpenAI-compatible no cliente e fake determinístico nos testes.
- **Reason**: Permite trocar modelos/provedores, aplicar fallback e observar custos sem acoplar domínio a SDKs de fornecedores.
- **Trade-off**: Recursos específicos de um provedor exigem extensões explícitas de capability e o proxy é um componente opcional adicional.
- **Scope**: extração, embeddings, assistente e observabilidade de custos
- **Date**: 2026-07-24
- **Status**: active

### AD-005
- **Decision**: Organização combinará facetas extensíveis com grafo tipado, resolução incremental e decisões automáticas auditáveis/reversíveis.
- **Reason**: Um mesmo conhecimento pertence a vários projetos e contextos; uma árvore rígida não representa o uso real.
- **Trade-off**: A UI e o ranking precisam explicar sobreposição, confiança e proveniência.
- **Scope**: biblioteca, ingestão, conceitos, grafo e RAG
- **Date**: 2026-07-24
- **Status**: active

### AD-006
- **Decision**: Toda IA seguirá recuperação/determinação local primeiro, cache/versionamento obrigatórios e políticas de modelo por capacidade e teto de custo.
- **Reason**: O volume diário do usuário torna custo, latência e reprocessamento requisitos arquiteturais.
- **Trade-off**: O sistema falha fechado quando nenhum modelo permitido cabe no orçamento, em vez de escolher silenciosamente um modelo caro.
- **Scope**: todos os caminhos de ingestão e consulta com IA
- **Date**: 2026-07-24
- **Status**: active

### AD-007
- **Decision**: `main` permanece protegida e controlada pelo proprietário; implementação e commits atômicos ocorrem em `dev`. O checkpoint especial sem commits foi encerrado pelo proprietário após aprovação explícita do frontend em 2026-07-24.
- **Reason**: Preserva a governança pedida e restaura histórico auditável depois do checkpoint visual.
- **Trade-off**: A promoção para produção continua dependendo exclusivamente do proprietário.
- **Scope**: fluxo Git de toda a implementação inicial
- **Date**: 2026-07-24
- **Status**: active

### AD-011
- **Decision**: A entrega executável do MVP será o aplicativo Tauri; o frontend Vite é apenas o renderer interno e o servidor Python continua opcional, nunca sendo requisito para abrir ou usar o vault local.
- **Reason**: O proprietário aprovou o frontend e pediu explicitamente o MVP como APP, não como produto web.
- **Trade-off**: O gate de entrega exige bundle nativo instalável; executar apenas a URL de desenvolvimento não conta como MVP pronto.
- **Scope**: empacotamento, aceite e operação local
- **Date**: 2026-07-24
- **Status**: active

### AD-008
- **Decision**: Cada provedor terá uma conexão e credencial Stronghold independentes; um único modelo configurado recebe o papel visível `Main` para extração, categorização e organização, enquanto o assistente pode selecionar outro modelo por conversa e fallbacks só executam quando configurados explicitamente.
- **Reason**: Dá ao usuário controle direto sobre OpenAI, Anthropic, DeepSeek e futuros provedores, mantendo previsível qual modelo organiza a biblioteca e quanto cada fluxo pode gastar.
- **Trade-off**: Exige mais adaptadores, estados de saúde e uma interface de configurações/routing mais rica do que um único endpoint genérico.
- **Scope**: configurações de IA, segredos, catálogo de modelos, organização e assistente
- **Date**: 2026-07-24
- **Status**: active

### AD-009
- **Decision**: `Continuar sem conta` é um fluxo principal; o aplicativo cria ou abre uma base/vault local escolhida pelo usuário, inicializa seus arquivos e metadados offline e não exige identidade, nuvem nem credencial de IA.
- **Reason**: A base de conhecimento deve pertencer ao usuário e funcionar com o mesmo modelo mental de uma pasta Obsidian, inclusive sem internet.
- **Trade-off**: Criação, colisões, staging/rollback e concessão segura de caminhos precisam de comandos nativos e testes próprios.
- **Scope**: onboarding, vault, segurança de filesystem e modo local
- **Date**: 2026-07-24
- **Status**: active

### AD-010
- **Decision**: Toda interface seguirá uma linguagem de aplicativo desktop nativo, retrô/editorial e minimalista, com superfícies sólidas, densidade compacta e sem gradientes, halos, glows ou linguagem visual de landing page SaaS.
- **Reason**: A identidade da biblioteca impossível e as referências Obsidian, VS Code e PyCharm pedem uma ferramenta durável e autoral, não uma vitrine promocional de IA.
- **Trade-off**: Abre mão de efeitos visuais chamativos e de parte do apelo imediato típico de produtos SaaS em favor de legibilidade, familiaridade e longevidade.
- **Scope**: onboarding, shell desktop, Ingest, Retrieve, configurações, componentes futuros e materiais de revisão visual
- **Date**: 2026-07-24
- **Status**: active

## Handoff

- **Feature**: Knowledge OS MVP / `.specs/features/knowledge-os-mvp/`
- **Phase / Task**: Execute — Phase 3+ em andamento; commits até `c1d7df7`/`9d575a9`/`5148d00` (settings/model catalog, wiring do workbench a `knowledge`, e2e de vault) implementam trabalho além de T30 mas ainda não foram lançados na tabela de `tasks.md`
- **Completed**: T01–T14 (fundação), T15–T20/T22/T24–T30/T36/T38–T40 (tabela `tasks.md`) todos commitados em `dev`; build nativo `.deb` + `.AppImage` gerado e verificado nesta sessão; suíte completa (`test-contracts`, `test-ui`, `test-python`, `test-rust`) verde
- **In-progress**: `.specs/features/knowledge-os-mvp/tasks.md` está desatualizado — os 4 últimos commits (wiring de UI/IPC a `knowledge.rs`, catálogo de modelos/Stronghold) cobrem parte de T21/T23/T31/T35/T41 mas não foram marcados nem auditados contra os critérios de aceite de cada task
- **Next step**: auditar os últimos 4 commits linha a linha contra os ACs de T21/T23/T31–T35/T37/T41–T42, marcar `tasks.md` com o que já está coberto e continuar a cadeia sequencial a partir da primeira task genuinamente incompleta
- **Blockers**: none
- **Uncommitted files**: none — árvore de trabalho limpa após o commit `b91ba4e` (auto-updater dev channel + CI)
- **Branch**: `dev` (18+1 commits à frente do que estava documentado; push liberado e `origin/dev` sincronizado nesta sessão)
