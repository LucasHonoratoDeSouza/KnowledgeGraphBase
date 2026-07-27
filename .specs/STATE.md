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

### AD-012
- **Decision**: Nenhuma dependência nova de runtime entra no app: renderização de Markdown, layout de grafo e marcas de provedor são implementados no próprio repositório.
- **Reason**: O app precisa compilar e rodar offline e o gate de lockfile roda com `--frozen-lockfile`; cada dependência adicionada é superfície de suprimento e peso de bundle.
- **Trade-off**: Menos recursos prontos (sem Markdown completo, sem d3-force) em troca de controle, tamanho e reprodutibilidade.
- **Scope**: renderer do desktop
- **Date**: 2026-07-25
- **Status**: active — clarified by AD-014 (scope confirmed as renderer-only)

### AD-013
- **Decision**: A organização tem duas metades explícitas: o arquivador incremental por captura (barato, todo capture) e o passe Librarian escopado a uma pasta (raro, deliberado, desfazível em uma ação). Ambos leem apenas a mini-summary `context:` de cada nota, nunca o corpo.
- **Reason**: Mantém o custo proporcional ao número de notas e cumpre a regra de que o app nunca reorganiza o vault inteiro silenciosamente.
- **Trade-off**: Toda nota gerada precisa carregar `context:`, e o Librarian depende dessa qualidade.
- **Scope**: ingestão, organização, Explorer
- **Date**: 2026-07-25
- **Status**: active

### AD-014
- **Decision**: AD-012 ("nenhuma dependência nova de runtime entra no app") aplica-se ao renderer do desktop (o bundle JS/React), não a plugins nativos Tauri do lado Rust. Plugins nativos para responsabilidades de backend (logging, updater etc.) são avaliados caso a caso pelo julgamento normal de revisão de dependências, e não bloqueados por AD-012.
- **Reason**: O design da feature Linux MVP (#39) precisa de `tauri-plugin-log` (plugin oficial Tauri) para logging local de erros/crashes e observabilidade de updates. Sem esta clarificação, a redação de AD-012 é ambígua o suficiente para bloquear até o próprio updater plugin já em uso (`tauri-plugin-updater`, já wired em `lib.rs:22`), o que não foi a intenção original.
- **Trade-off**: Abre a porta para outros plugins nativos Tauri no futuro sem uma revisão de arquitetura formal — mitigado por permanecer sujeito a julgamento normal de revisão de dependências (não é um cheque em branco).
- **Scope**: dependências nativas Rust/Tauri do app desktop
- **Date**: 2026-07-26
- **Status**: active

## Handoff

- **Feature**: Ready backlog / `.specs/features/ready-backlog/`
- **Phase / Task**: Execute complete — all 25 tasks done, independent validation pass written to `validation.md` (PASS)
- **Completed**: issues #4, #5, #7, #10, #12, #13, #14, #15, #17, #18 and #29, each with tests; full gates green (lint, typecheck, format, 117 desktop + 45 package unit tests, 26 Playwright e2e, Rust workspace suite, clippy, builds)
- **In-progress**: none
- **Next step**: owner testing of the branch, then PR into `dev`; remaining board items are the Blocked agent epic (#19–#26)
- **Blockers**: none. Pre-existing repo drift: `cargo fmt --check` disagrees with five files this branch never touched (newer rustfmt)
- **Uncommitted files**: none
- **Branch**: `feat/ready-backlog`
