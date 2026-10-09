# Servidor do escritório: login com Google/Microsoft e vários advogados

Sem servidor, o OpenJus funciona só no aparelho. Com um projeto **Supabase** do próprio escritório (o plano gratuito basta para começar), ele ganha:

- **Login com Google ou Microsoft.** O app não vê nem guarda senhas.
- **Escritório com vários advogados.** Cada um entra no próprio celular com a própria conta e vê os mesmos clientes, processos, prazos e financeiro.
- **Sincronização automática** entre os aparelhos, que junta as alterações feitas por pessoas diferentes.
- **Convites por e-mail**, com três papéis: administrador, advogado e assistente.
- **Integrações compartilhadas.** O administrador configura uma vez os webhooks do n8n e as pastas do Google Drive/OneDrive, e cada advogado só precisa entrar com a conta para ter acesso às pastas do escritório.
- **Busca no Diário com a equipe toda.** As OABs da equipe entram na busca de publicações do DJEN.

## 1. Criar o projeto e o banco

1. Crie um projeto em [supabase.com](https://supabase.com). Escolha a região São Paulo (`sa-east-1`).
2. Abra **SQL Editor**, cole o conteúdo de [`supabase/migrations/20261009000000_openjus.sql`](supabase/migrations/20261009000000_openjus.sql) e execute.
   - Se preferir a CLI: rode `supabase link` e depois `supabase db push`, a partir desta pasta.
3. Em **Project Settings › API**, copie:
   - o **Project URL** (`https://xxxx.supabase.co`);
   - a chave **publishable**, ou a **anon** nos projetos antigos.

   Nunca use a chave `service_role` ou `sb_secret_…` no app. O app recusa essas chaves.

## 2. Ligar o login com Google e Microsoft

Em **Authentication › Sign In / Providers**:

- **Google:**
  1. No [Google Cloud Console](https://console.cloud.google.com/apis/credentials), crie um "ID do cliente OAuth" do tipo *Aplicativo da Web*.
  2. Em *URIs de redirecionamento autorizados*, coloque `https://xxxx.supabase.co/auth/v1/callback`.
  3. Cole o Client ID e o Client Secret no Supabase.
- **Azure (Microsoft):**
  1. No [portal do Azure](https://portal.azure.com) › *Registros de aplicativo*, crie um app.
  2. Em *Contas compatíveis*, escolha a opção que inclui contas pessoais e corporativas.
  3. Em *Redirecionamento*, use *Web* com `https://xxxx.supabase.co/auth/v1/callback`.
  4. Crie um segredo do cliente e cole o ID e o segredo no Supabase.

  Deixe o *Azure Tenant URL* em branco para aceitar qualquer conta Microsoft, ou informe o do escritório para aceitar só as contas dele.

Em **Authentication › URL Configuration › Redirect URLs**, inclua:

| Onde o app roda | URL de retorno |
| --- | --- |
| App instalado (APK/iOS) | `openjus://auth` |
| Expo Go (desenvolvimento) | `exp://**` |
| Web local | `http://localhost:8081/auth` |
| Web publicada | `https://seu-dominio/auth` |

As senhas ficam com o Google e a Microsoft, e os dois provedores entregam o e-mail já verificado. O banco só aceita convites para contas com e-mail verificado (`email_confirmed_at`).

## 3. Conectar o app

Há duas formas:

- **No app:** abra **Ajustes › Entrar com Google ou Microsoft › Servidor do escritório** e informe o endereço e a chave pública.
- **No build:** defina `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_KEY` ao gerar o app.
  - No GitHub Actions do APK de teste, use as *variables* do repositório `OPENJUS_SUPABASE_URL` e `OPENJUS_SUPABASE_KEY`.
  - A chave pública pode ir no app: quem protege os dados são as regras de acesso (RLS) do banco.

Depois, no app:

1. **Entrar com Google** (ou Microsoft).
2. **Criar escritório.** Os dados do aparelho viram os dados do escritório, e quem cria vira administrador.
3. Em **Convidar advogado**, informe o e-mail da pessoa. Quando ela entrar no OpenJus com a conta desse e-mail, já cai no escritório.
4. Opcional: em **Compartilhar integrações**, envie para a equipe os webhooks do n8n e as pastas do Drive/OneDrive.

Quem entra num escritório já tendo dados no aparelho escolhe o que fazer com eles:

- **juntar** os dados do aparelho com os do escritório;
- **usar só os do escritório**, descartando os que existem apenas no aparelho.

## Como a sincronização funciona

- Cada escritório tem um documento de dados com **número de versão**.
- O app grava com `salvar_dados(versão lida)`. Se outra pessoa gravou antes, o servidor recusa com o código `40001` e o app mescla de novo.
- A mescla é feita **registro a registro**, comparando com a última sincronização:
  - o que só um lado alterou prevalece;
  - se os dois alteraram o mesmo registro, vale a versão de quem está sincronizando;
  - edição vence exclusão.
- A sincronização roda:
  - ao abrir o app;
  - ao voltar para ele;
  - 4 segundos depois de cada alteração;
  - quando a pessoa toca em **Sincronizar agora**.
- Ficam **só no aparelho** e não são sincronizados:
  - o perfil;
  - os tokens;
  - a configuração do DataJud e dos prazos automáticos.

Limite atual: 20 MB de dados por escritório. Isso equivale a dezenas de milhares de processos com andamentos.

## Segurança

O detalhamento está em [SEGURANCA.md](../SEGURANCA.md).

- **RLS em todas as tabelas.**
  - Sem login, nada é acessível.
  - Cada pessoa só vê os escritórios de que participa.
  - Só administradores veem convites, convidam, mudam papéis e alteram as integrações.
- **Escritas pelo banco.** As escritas sensíveis passam por funções `SECURITY DEFINER` com `search_path` vazio, que conferem quem chama:
  - `criar_escritorio`;
  - `aceitar_convites`;
  - `salvar_dados`;
  - `remover_membro`;
  - `definir_papel`.
- **Sempre há um administrador.** O último administrador não pode sair nem perder o papel.
- **Tokens no aparelho.**
  - O token de acesso fica só na memória.
  - O de renovação fica no Keystore/Keychain (na web, no `sessionStorage`).
  - Nada vai para o `AsyncStorage` ou o `localStorage`.
- **Login com PKCE (S256).** O código de autorização sozinho não serve para nada.
- **Limites de taxa.** O Supabase já aplica limites ao login. Para limitar também a API REST, ative a proteção do projeto em *Settings › API*.
- **Integrações compartilhadas.** Os tokens dos webhooks do n8n ficam na tabela `config_escritorio`. Ela só pode ser lida pelos membros do escritório e alterada pelos administradores. Ao remover alguém da equipe, troque o token do webhook no n8n e compartilhe de novo.

## Testar as regras de acesso

```bash
npm run testar:nuvem
```

Esse comando roda a migração num Postgres local ([PGlite](https://pglite.dev)), simulando o `auth` do Supabase, e confere 37 regras. Entre elas:

- isolamento entre escritórios;
- convites só para e-mail verificado;
- conflito de versão;
- permissões de cada papel;
- RLS ligado em todas as tabelas.
