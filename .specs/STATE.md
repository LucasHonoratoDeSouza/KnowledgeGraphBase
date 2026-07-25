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
- **Phase / Task**: Execute — Phases 1–6 audited complete except two confirmed gaps: T33 (entity resolution beyond exact/alias dedup) and T37 (optional embeddings, non-blocking per spec)
- **Completed**: T01–T32, T34–T36, T38–T42 verified this session by re-running `make check` (lint/format/typecheck/lock-check/build) and `make test-full` (Rust unit+integration, Tauri IPC contract, UI, Python, Playwright e2e) against the real `dev` HEAD, all green; native `.deb` + `.AppImage` build fixed and verified; dev-channel CI (`.github/workflows/dev-build.yml`) publishes a signed, auto-incrementing `dev` prerelease on every push, and the installed app self-updates from it; `README.md` added
- **In-progress**: none — this is a clean stopping point
- **Next step**: implement T33 (entity resolution: fuzzy/vector candidates + ambiguous-AI-fallback escalation, currently only exact/alias dedup) and, if desired, T37 (sqlite-vec embedding adapter, optional per spec); then continue into Phase 7 (Optional Server) / Phase 8 (Production Engineering) only if the owner wants the remote/ops layers
- **Blockers**: none. Two open decisions for the owner: (1) LICENSE is unset (README notes this); (2) whether Phase 7/8 (optional server, k8s/terraform, code signing) are in scope for this project at all
- **Uncommitted files**: none — working tree clean
- **Branch**: `dev`, synced with `origin/dev`
