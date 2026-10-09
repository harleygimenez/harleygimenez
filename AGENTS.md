## Requisitos do produto que devem ser mantidos

OpenJus é um app de gestão jurídica (processos, pipeline de fases, timeline, agenda, prazos, clientes, financeiro). Ao mudar o app, preserve:

- **Integração com Google Drive e Google Docs via n8n (webhook).** Importar arquivos do Drive para processos e clientes, e gerar documentos a partir de modelos do Google Docs com campos `{{chave}}`, salvando o resultado em uma pasta específica do Drive. O app nunca guarda credenciais do Google. Ele chama o webhook do n8n com o cabeçalho `X-OpenJus-Token`. O contrato do webhook está em `integracoes/n8n/README.md`, o cliente em `src/lib/n8n.ts` e os campos em `src/lib/mesclagem.ts`. Ao mudar o contrato ou os campos, atualize juntos o workflow `integracoes/n8n/openjus-google-drive.json`, o guia e os testes.
- **Integração com OneDrive e Word via n8n (webhook).** É a alternativa ao Google, com o mesmo contrato de webhook: importar arquivos e gerar documentos a partir de modelos `.docx` com campos `{{chave}}`, salvos numa pasta do OneDrive. Fica no workflow `integracoes/n8n/openjus-onedrive.json`. O preenchimento do Word está em `integracoes/n8n/codigo/mesclarDocx.js` e tem testes. Os workflows são gerados por `integracoes/n8n/gerar-workflows.mjs`: edite o código em `codigo/`, nunca o JSON.
- **DataJud (API pública do CNJ).** Consulta pelo número CNJ e importa as movimentações como andamentos sem duplicar (`chaveExterna`). Fica em `src/lib/datajud.ts`. A chave pública pode ser trocada em Ajustes.
- **Diário de Justiça Eletrônico Nacional (DJEN / Comunica PJe).** Importa o texto publicado (inteiro teor) de despachos, decisões e sentenças para a timeline, com o link da certidão (só `https://`), sem duplicar (`chaveExterna` `djen:`). Busca também pelas OABs do titular e da equipe, cadastrando processos e clientes novos. Fica em `src/lib/djen.ts` e `src/data/importacao.ts`; a tela é `src/app/publicacoes.tsx`.
- **Prazos automáticos das publicações.** Prazo fixado no texto ou, se não houver, o da lei por ato e rito (CPC, CLT, Lei 9.099, CPP). Publicação no 1º dia útil após a disponibilização e contagem pelos arts. 219, 220 e 224 do CPC. Só prazos abertos entram na agenda e um prazo excluído não volta. Fica em `src/lib/prazosPublicacao.ts`, com testes. Pode ser desligado em Ajustes.
- **Login com Google/Microsoft e escritório com vários advogados (opcional, Supabase).** Cliente HTTP próprio com PKCE em `src/lib/nuvem.ts`; estado, convites e sincronização em `src/data/nuvem.ts`; mescla de três vias em `src/data/mesclagemDados.ts`. O banco fica em `nuvem/supabase/migrations`: RLS em todas as tabelas, escritas por funções `SECURITY DEFINER` com `search_path` vazio, e convites só para e-mail verificado. Ao mudar o banco, atualize `nuvem/testar-rls.mjs` e rode `npm run testar:nuvem`. A sessão nunca é persistida no AsyncStorage: o token de renovação fica em `src/lib/segredos.ts`.
- **Segurança (ver `SEGURANCA.md`).** Tokens nunca vão para o AsyncStorage ou o localStorage: ficam em `src/lib/segredos.ts`. IDs são UUID criptográfico. Links vindos de fora só são abertos se forem `https://`. Webhooks com token, CORS restrito, limite de taxa e validação no n8n. `npm run seguranca` e `npm run testar:nuvem` precisam passar. Backend: RLS em todas as tabelas, sem permissões para `anon`, login só por OAuth (sem senhas próprias) e e-mail verificado para entrar num escritório. A chave `service_role` nunca vai no app.
- Textos da interface em português do Brasil.

This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
