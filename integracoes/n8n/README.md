# Integração com Google Drive/Docs e OneDrive/Word (via n8n)

O app **OpenJus** usa workflows do [n8n](https://n8n.io) para:

- **Importar arquivos** do Google Drive ou do OneDrive: buscar arquivos na sua conta e vinculá-los a um processo ou cliente.
- **Gerar documentos a partir de modelos**: preencher campos como `{{cliente.nome}}` em um modelo do Google Docs ou do Word (.docx no OneDrive) e salvar o resultado em uma pasta específica.

As credenciais do Google e da Microsoft ficam **só no n8n**. O app envia um token próprio no cabeçalho `X-OpenJus-Token` a cada chamada.

| Arquivo | Webhook | Serviço |
| --- | --- | --- |
| `openjus-google-drive.json` | `/webhook/openjus` | Google Drive API + Google Docs API |
| `openjus-onedrive.json` | `/webhook/openjus-onedrive` | Microsoft Graph (OneDrive) |

Use um, o outro ou os dois. Cada um tem a sua seção em **Ajustes › Integrações**.

```
App OpenJus ──POST /webhook/openjus──────────▶ n8n ──▶ Google Drive API (listar, copiar) + Docs API (preencher)
App OpenJus ──POST /webhook/openjus-onedrive─▶ n8n ──▶ Graph: baixar .docx → preencher no n8n → enviar ao OneDrive
```

# Google Drive e Google Docs

## 1. Importar o workflow

1. No n8n, crie um workflow novo e use **⋯ › Import from File**.
2. Escolha `openjus-google-drive.json` (nesta pasta).

## 2. Criar as credenciais

**Token do app (Header Auth):**

1. Abra o nó **Webhook do OpenJus** e, em *Credential for Header Auth*, crie uma nova credencial.
2. **Name:** `X-OpenJus-Token`.
3. **Value:** um segredo longo, por exemplo o resultado de `openssl rand -hex 24`. Guarde-o para o app.

**Google (OAuth2):**

1. Abra o nó **Listar arquivos do Drive** e, em *Credential for Google Docs OAuth2 API*, crie uma credencial e faça login com a conta Google do escritório. Siga o [guia do n8n](https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/). No Google Cloud, ative a **Google Drive API** e a **Google Docs API**.
2. Selecione a mesma credencial nos nós **Copiar modelo** e **Mesclar campos no Docs**.

## 3. Ativar

Salve e **ative** o workflow. A URL de produção aparece no nó **Webhook do OpenJus** (aba *Production URL*), por exemplo `https://seu-n8n.com/webhook/openjus`.

## 4. Configurar o app

Em **Ajustes › Integrações**:

| Campo | Valor |
| --- | --- |
| URL de produção do webhook | a URL do passo 3 |
| Token | o *Value* da credencial Header Auth |
| Pasta para documentos gerados | link da pasta do Drive onde os documentos preenchidos serão salvos |
| Pasta padrão para importar | opcional; link da pasta mostrada primeiro ao importar |

Toque em **Testar conexão**. Preencha também **Seus dados nos documentos** (nome, OAB, cidade).

## 5. Criar modelos

1. No Google Docs, escreva o documento usando campos entre chaves duplas, por exemplo:

   > OUTORGANTE: **{{cliente.nome}}**, inscrito no {{cliente.tipo_documento}} sob o nº {{cliente.documento}}, residente em {{cliente.endereco}}, nomeia como procurador(a) **{{advogado.nome}}**, {{advogado.oab}}…
   >
   > {{advogado.cidade}}, {{data.extenso}}.

2. No app, vá em **Ajustes › Modelos de documentos › +** e cole o link do documento.
3. Para gerar, abra um processo ou cliente e, em Documentos, toque em **Gerar**.

A lista completa de campos aparece na tela de modelos do app. Campos sem valor ficam em branco.

# OneDrive e Word

## 1. Importar e configurar

1. Importe `openjus-onedrive.json` no n8n.
2. No nó **Webhook do OpenJus**, use uma credencial *Header Auth* com **Name** `X-OpenJus-Token`. Pode ser a mesma do Google.
3. No nó **Listar arquivos do OneDrive**, crie uma credencial **Microsoft Drive OAuth2 API** e entre com a conta Microsoft do escritório ([guia do n8n](https://docs.n8n.io/integrations/builtin/credentials/microsoft/)). A permissão padrão `Files.ReadWrite.All` é suficiente.
4. Selecione a mesma credencial nos nós **Baixar modelo** e **Salvar no OneDrive**.
5. Salve e ative. A URL de produção termina em `/webhook/openjus-onedrive`.

## 2. Configurar o app

Na seção **OneDrive** de **Ajustes › Integrações**, as pastas são **caminhos a partir da raiz do seu OneDrive**, por exemplo `/OpenJus/Documentos`.

## 3. Modelos do Word

1. Crie o modelo no Word com campos como `{{cliente.nome}}` (no corpo, em tabelas, no cabeçalho ou no rodapé) e salve como `.docx` no OneDrive, por exemplo em `/OpenJus/Modelos/Procuracao.docx`.
2. No app, cadastre o modelo escolhendo **Word no OneDrive** e informe esse caminho.

O workflow baixa o modelo, preenche os campos dentro do próprio n8n e envia o resultado à pasta de destino. Se já existir um arquivo com o mesmo nome, o OneDrive acrescenta um número. A formatação (negrito, fontes, tabelas) é mantida. O Word às vezes divide um campo em vários pedaços internos, por exemplo quando a correção ortográfica marca a palavra, e o preenchimento cuida disso. Mesmo assim, escreva cada campo de uma vez só, sem formatação diferente no meio.

# Segurança (leia antes de colocar em produção)

- **`NODE_ENV=production`:** sem isso, o n8n devolve o stack trace (com caminhos do servidor) para pedidos malformados, mesmo sem token. A imagem Docker oficial já vem assim.
- **HTTPS obrigatório:** o app recusa `http://` fora da rede local.
- **Token:** gere um valor longo e aleatório, por exemplo `openssl rand -hex 32`.
- **Configuração no nó Validar pedido:** o bloco `CONFIG` no topo controla o limite de chamadas por minuto (padrão 60, depois disso HTTP 429) e as **pastas fixas** opcionais. Com as pastas fixas preenchidas, o workflow ignora as pastas enviadas pelo app, e um token vazado não alcança outras pastas.
- **CORS:** o nó Webhook do OpenJus aceita só a origem `http://localhost:8081` (servidor de desenvolvimento do Expo web). Se publicar a versão web, troque em *Options › Allowed Origins (CORS)* pelo domínio dela. O app Android/iOS não depende disso.
- **Proxy:** tentativas com token errado são recusadas antes do workflow e não entram no limite de chamadas. Para limitá-las também, use um proxy (Cloudflare, nginx `limit_req`).
- **Teste do seu servidor:** depois de configurar, rode o teste a partir da raiz do repositório. Ele não altera nada no Drive/OneDrive.

  ```bash
  OPENJUS_WEBHOOK=https://seu-n8n.com/webhook/openjus OPENJUS_TOKEN=... node integracoes/n8n/testar-seguranca.mjs
  ```

# Detalhes técnicos

## Contrato do webhook

Todas as chamadas são `POST` com JSON e o cabeçalho `X-OpenJus-Token`. Ações com dados inválidos respondem `400` com `{ "erro": "…" }`.

| `acao` | Corpo | Resposta `200` |
| --- | --- | --- |
| `ping` | – | `{ "ok": true, "versao": 1 }` |
| `listar_arquivos` | `busca?`, `pastaId?` | `{ "arquivos": [{ "id", "nome", "url", "mimeType", "modificadoEm" }] }` (até 50, mais recentes primeiro) |
| `gerar_documento` | `modeloId`, `pastaId`, `nomeArquivo`, `campos: { "cliente.nome": "…" }` | `{ "arquivo": { "id", "nome", "url", "mimeType" } }` |

No OneDrive, `modeloId` e `pastaId` são caminhos (`/OpenJus/Modelos/Procuracao.docx`, `/OpenJus/Documentos`) em vez de IDs.

Esse contrato permite trocar o n8n por outro backend (Make, Apps Script, servidor próprio) sem mudar o app.

## Alterar os workflows

O código dos nós está em `codigo/`, e os arquivos `.json` são gerados a partir dele. Para mudar um workflow, edite o código e rode:

```bash
node integracoes/n8n/gerar-workflows.mjs
```

O preenchimento de campos do Word (`codigo/mesclarDocx.js`) é testado pelo Jest do app (`npm test`).

## Problemas comuns

- **"O n8n recusou o token"**: o token do app não bate com o *Value* da credencial Header Auth.
- **"Webhook não encontrado"**: o workflow não está ativo, ou foi usada a URL de teste (`/webhook-test/…`) em vez da de produção.
- **"O Google/OneDrive recusou o pedido (404)"**: o modelo ou a pasta não existe, ou a conta conectada ao n8n não tem acesso a ele.
- **"O Google recusou o pedido (403)"**: a credencial não tem permissão, ou as APIs Drive e Docs não estão ativadas no Google Cloud.
- **"O n8n respondeu com erro 500"**: veja a execução no n8n para detalhes.
