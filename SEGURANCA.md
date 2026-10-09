# Segurança do OpenJus

Auditoria feita em 09/10/2026 sobre o app (Expo), os workflows do n8n (Google Drive/Docs e OneDrive/Word), as integrações com o DataJud e o Diário de Justiça (DJEN) e o servidor opcional do escritório (Supabase: login e equipe). Além da revisão do código, os itens foram **testados na prática**: testes automatizados do app, ataques reais contra os workflows rodando num n8n 2.42 local (com APIs do Google e da Microsoft simuladas) e testes no navegador.

## Como o app funciona (e o que isso muda na análise)

- Por padrão, os dados ficam **no aparelho**.
- Opcionalmente, o escritório liga um **servidor próprio (Supabase)**. Ele traz:
  - login com Google ou Microsoft;
  - vários advogados no mesmo escritório;
  - sincronização dos dados.

  O banco tem RLS em todas as tabelas (ver [nuvem/README.md](nuvem/README.md)).
- O acesso ao Google Drive/Docs e ao OneDrive passa pelo **n8n do escritório**. As credenciais OAuth ficam no n8n, e o app só tem um token próprio para chamar o webhook.
- O DataJud e o Diário de Justiça Eletrônico Nacional (Comunica PJe) são APIs públicas do CNJ, consultadas direto pelo app.

## Resultado por item

| # | Item | Situação | O que foi feito / evidência |
| --- | --- | --- | --- |
| 1 | Chaves de API no frontend | ✅ Sem problema | Varredura do código e do **bundle web gerado** (`npm run seguranca -- dist`): nenhum segredo. As credenciais do Google e da Microsoft ficam só no n8n. A única chave no app é a do DataJud, que é **pública por definição** (o CNJ a divulga na wiki da API) e pode ser trocada em Ajustes. |
| 2 | Sem RLS | ✅ Implementado e testado | O banco do escritório (`nuvem/supabase/migrations`) tem **RLS em todas as 5 tabelas**. Sem login, nada é acessível: o papel `anon` não tem nenhuma permissão. As escritas sensíveis passam por funções `SECURITY DEFINER` com `search_path` vazio, que conferem `auth.uid()` e o papel. O `npm run testar:nuvem` roda a migração num Postgres local (PGlite) e confere **37 regras**: isolamento entre escritórios, ninguém se incluir na equipe, só admin convida/remove/altera integrações, conflito de versão e RLS em toda tabela. O `npm run seguranca` falha se surgir tabela sem RLS. |
| 3 | Permissões só no frontend | ✅ Corrigido | As regras valem **no n8n**, não só no app: token obrigatório, validação de cada pedido e a opção de **pasta fixa** (`CONFIG.pastaDestinoFixa` / `pastaImportacaoFixa`). Teste: com a pasta fixa definida, um pedido que pedia outra pasta foi gravado na pasta fixa. |
| 4 | Sem rate limit | ✅ Corrigido | Limite de 60 chamadas por minuto em cada webhook, configurável no n8n, com resposta HTTP 429 e mensagem clara. Teste: uma rajada de 70 chamadas recebeu 429, e com limite 5 a 6ª chamada foi bloqueada. Tentativas com token errado são recusadas antes do workflow; para limitá-las também, use um proxy (ver guia do n8n). |
| 5 | Input direto no SQL | ✅ Sem problema (não há SQL) | Os equivalentes foram testados: a busca no Drive (`q`) e no Graph é escapada, `../` é bloqueado nos caminhos do OneDrive, IDs só aceitam `[A-Za-z0-9_-]`, o DataJud recebe só os dígitos do número, e o XML do Word é escapado (`&`, `<`, `>`). Aspas, barras e `' or '1'='1` foram tratados como texto. |
| 6 | Inputs sem validação | ✅ Corrigido | No app: CNJ com dígito verificador, CPF/CNPJ, e-mail, datas, valores, horários e **tamanho máximo em todo campo de texto** (300/5000). No n8n: tipos e formatos de ID e caminho, até 100 campos, nomes de campo `[\w.]{1,60}` e valores de até 10 mil caracteres. As **respostas do n8n também são validadas**: só passam links `https://`, o que bloqueia `javascript:` e `data:`. |
| 7 | Senhas em texto puro | ✅ Sem senhas | O login é só com **Google ou Microsoft** (OAuth com PKCE S256): o OpenJus e o Supabase não recebem nem guardam senhas. O app recusa a chave `service_role`/`sb_secret_` do Supabase, e o verificador procura essas chaves no código. |
| 8 | Tokens no localStorage | ✅ Corrigido | Os tokens **saíram do armazenamento comum**. Na sessão do escritório, o token de acesso fica só na memória e o de renovação no cofre. O teste no navegador confirma que nenhum dos dois aparece no `localStorage`. No Android/iOS ficam no Keystore/Keychain (`expo-secure-store`); na web, só no `sessionStorage`, que é apagado ao fechar a aba. Tokens de versões antigas são migrados e apagados. Teste no navegador: o `localStorage` não contém o token. |
| 9 | CORS liberado | ✅ Corrigido | Os webhooks deixaram de aceitar qualquer origem: `allowedOrigins` fica em `http://localhost:8081` por padrão. Teste: o app aberto em outra origem foi bloqueado e na origem autorizada conectou. Apps Android/iOS não usam CORS. |
| 10 | Sem e-mail verificado | ✅ Exigido | Só contas com **e-mail verificado** criam escritório ou aceitam convites: o banco confere `auth.users.email_confirmed_at`, e o app recusa sessões sem verificação. Testes: uma conta não verificada não cria escritório nem entra por convite. Os convites valem 14 dias e o e-mail é comparado sem diferenciar maiúsculas. |
| 11 | IDs previsíveis na URL | ✅ Corrigido | Os IDs passaram de `timestamp + Math.random` para **UUID v4 criptográfico** (`expo-crypto`); os escritórios usam `gen_random_uuid()`. Mesmo conhecendo o ID de outro escritório, o RLS bloqueia o acesso (IDOR testado). |
| 12 | Webhook não validado | ✅ Corrigido | O n8n exige o cabeçalho `X-OpenJus-Token`: sem token ou com token errado, responde 403 (testado). O app **recusa `http://`** fora da rede local, para o token não trafegar sem criptografia. |
| 13 | Stack trace em produção | ⚠️ Encontrado e corrigido na configuração | **Achado real:** o n8n em modo de desenvolvimento devolve o stack trace completo (com caminhos do servidor) para um JSON malformado, **mesmo sem token**. A correção é rodar com `NODE_ENV=production`, que já é o padrão da imagem Docker oficial; o guia do n8n agora exige isso. Teste: em produção a resposta traz só a mensagem. No app, um `ErrorBoundary` próprio esconde os detalhes fora do modo de desenvolvimento, e os erros do Google e da Microsoft chegam resumidos. |
| 14 | Dependências vulneráveis | ⚠️ Risco aceito, monitorado | O `npm audit` mostra 64 alertas, que vêm de 5 pacotes. Quatro (`braces`, `node-forge`, `sprintf-js`, `uuid`) são só de **ferramentas de build e teste** (Jest, Expo CLI, gerador do Xcode) e não entram no app. Um (`decode-uri-component`, via expo-router) **entra no app**: um link malicioso pode travá-lo, sem vazar dados. A correção oficial só existe no Expo SDK 58, e forçar a versão nova quebra a navegação (é só ESM). Plano: atualizar quando o SDK 58 for estável. O verificador **falha se surgir qualquer alerta novo**. |
| 15 | Uploads sem validação | ✅ Sem problema | O app não envia arquivos do usuário; arquivos importados do Drive/OneDrive são só **links**. O único upload é o .docx gerado pelo n8n: o modelo precisa ser `.docx` e conter `word/document.xml`, a descompactação do n8n tem limite de tamanho e de quantidade de arquivos (proteção contra zip bomb), o nome do arquivo é saneado e o OneDrive **nunca sobrescreve** (`conflictBehavior=rename`). |

## Como repetir os testes

```bash
npm test                          # 91 testes, incluindo segurança, login (PKCE) e sincronização
npm run testar:nuvem              # 37 regras de acesso (RLS) do banco do escritório
npx expo export -p web --output-dir dist && npm run seguranca -- dist
                                  # segredos no código e no bundle, padrões perigosos,
                                  # configuração dos workflows e dependências

# Contra o seu n8n de verdade (não altera nada no Drive/OneDrive):
OPENJUS_WEBHOOK=https://seu-n8n.com/webhook/openjus OPENJUS_TOKEN=... \
  node integracoes/n8n/testar-seguranca.mjs
```

O `testar-seguranca.mjs` verifica:
- autenticação (sem token, token errado, token certo);
- CORS;
- 8 tipos de entrada maliciosa ou inválida;
- injeção na busca;
- stack trace com JSON malformado;
- limite de requisições.

## Checklist de produção

- [ ] n8n com `NODE_ENV=production` (padrão na imagem Docker oficial) e acessível só por **HTTPS**.
- [ ] Token do webhook longo e aleatório (`openssl rand -hex 32`), diferente para cada escritório.
- [ ] Se usar a versão web do app, trocar `allowedOrigins` no nó **Webhook do OpenJus** pelo domínio do app.
- [ ] Preencher `CONFIG.pastaDestinoFixa` e `pastaImportacaoFixa` no nó **Validar pedido** para limitar o que um token vazado alcança.
- [ ] De preferência, conectar uma conta Google/Microsoft dedicada ao escritório, só com as pastas necessárias.
- [ ] Limitar tentativas por IP num proxy na frente do n8n (Cloudflare, nginx `limit_req`).
- [ ] Servidor do escritório (se usado):
  - só a chave **publishable/anon** no app;
  - URLs de retorno restritas em *Authentication › URL Configuration*;
  - ao remover alguém da equipe, trocar o token do webhook do n8n e compartilhar as integrações de novo.
- [ ] Rodar `npm run seguranca` e `npm run testar:nuvem` antes de cada versão.

## O que não foi testado

- **Contas reais do Google, da Microsoft, do Supabase, do DataJud e do DJEN:**
  - os testes usaram APIs simuladas no mesmo formato, porque a rede deste ambiente bloqueia os domínios do CNJ;
  - o banco foi testado com a migração real num Postgres local (PGlite), simulando o `auth` do Supabase.
- **Varredura dinâmica (DAST) com HawkScan:** não rodou, porque não há chave da StackHawk configurada e o app não tem servidor próprio para escanear.
- **Build nativo Android/iOS:** o armazenamento seguro foi testado com o módulo simulado no Jest e com o `sessionStorage` no navegador, não num aparelho.
