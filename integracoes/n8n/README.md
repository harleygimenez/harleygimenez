# Integração com Google Drive e Google Docs (via n8n)

O app **Causa** usa um workflow do [n8n](https://n8n.io) para:

- **Importar arquivos do Google Drive**: buscar arquivos na sua conta e vinculá-los a um processo ou cliente.
- **Gerar documentos a partir de modelos do Google Docs**: copiar um modelo, preencher campos como `{{cliente.nome}}` e salvar o resultado em uma pasta específica do Drive.

As credenciais do Google ficam **só no n8n**. O app envia um token próprio no cabeçalho `X-Causa-Token` a cada chamada.

```
App Causa ──POST /webhook/causa──▶ n8n ──▶ Google Drive API (listar, copiar)
          ◀──────── JSON ────────       └─▶ Google Docs API (preencher campos)
```

## 1. Importar o workflow

1. No n8n, crie um workflow novo e use **⋯ › Import from File**.
2. Escolha `causa-google-drive.json` (nesta pasta).

## 2. Criar as credenciais

**Token do app (Header Auth):**

1. Abra o nó **Webhook do Causa** e, em *Credential for Header Auth*, crie uma nova credencial.
2. **Name:** `X-Causa-Token`.
3. **Value:** um segredo longo, por exemplo o resultado de `openssl rand -hex 24`. Guarde-o para o app.

**Google (OAuth2):**

1. Abra o nó **Listar arquivos do Drive** e, em *Credential for Google Docs OAuth2 API*, crie uma credencial e faça login com a conta Google do escritório. Siga o [guia do n8n](https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/). No Google Cloud, ative a **Google Drive API** e a **Google Docs API**.
2. Selecione a mesma credencial nos nós **Copiar modelo** e **Mesclar campos no Docs**.

## 3. Ativar

Salve e **ative** o workflow. A URL de produção aparece no nó **Webhook do Causa** (aba *Production URL*), por exemplo `https://seu-n8n.com/webhook/causa`.

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
3. Para gerar, abra um processo ou cliente e toque em **Gerar de modelo**.

A lista completa de campos aparece na tela de modelos do app. Campos sem valor ficam em branco.

## Contrato do webhook

Todas as chamadas são `POST` com JSON e o cabeçalho `X-Causa-Token`. Ações com dados inválidos respondem `400` com `{ "erro": "…" }`.

| `acao` | Corpo | Resposta `200` |
| --- | --- | --- |
| `ping` | – | `{ "ok": true, "versao": 1 }` |
| `listar_arquivos` | `busca?`, `pastaId?` | `{ "arquivos": [{ "id", "nome", "url", "mimeType", "modificadoEm" }] }` (até 50, mais recentes primeiro) |
| `gerar_documento` | `modeloId`, `pastaId`, `nomeArquivo`, `campos: { "cliente.nome": "…" }` | `{ "arquivo": { "id", "nome", "url", "mimeType" } }` |

Esse contrato permite trocar o n8n por outro backend (Make, Apps Script, servidor próprio) sem mudar o app.

## Problemas comuns

- **"O n8n recusou o token"**: o token do app não bate com o *Value* da credencial Header Auth.
- **"Webhook não encontrado"**: o workflow não está ativo, ou foi usada a URL de teste (`/webhook-test/…`) em vez da de produção.
- **"O n8n respondeu com erro 500"**: veja a execução no n8n. O mais comum é a conta Google não ter acesso ao modelo ou à pasta, ou as APIs Drive e Docs não estarem ativadas no Google Cloud.
