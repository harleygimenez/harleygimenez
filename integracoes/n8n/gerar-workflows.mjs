// Gera os workflows do n8n a partir do código dos nós em ./codigo.
// Uso: node integracoes/n8n/gerar-workflows.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pasta = dirname(fileURLToPath(import.meta.url));
const ler = (caminho) => readFileSync(join(pasta, 'codigo', caminho), 'utf8');

// mesclarDocx.js é um módulo CommonJS testado pelo Jest; no n8n entra como código solto.
const mesclarDocx = ler('mesclarDocx.js').replace(/\nmodule\.exports = .*\n?$/, '\n');

/**
 * Configuração de segurança no topo do nó "Validar pedido". Valores definidos no
 * n8n, fora do alcance do app: mesmo com o token vazado, ninguém lista nem grava
 * fora das pastas fixas (quando preenchidas).
 */
function config(provedor) {
  const exemplo = provedor === 'google' ? 'ID da pasta no Drive' : 'caminho, ex.: /Causa/Documentos';
  return `// ===== Configuração de segurança (edite aqui) =====
const CONFIG = {
  // Máximo de chamadas por minuto a este webhook (o excedente recebe HTTP 429).
  limitePorMinuto: 60,
  // Se preenchidas, valem no lugar das pastas enviadas pelo app (${exemplo}).
  pastaDestinoFixa: '',
  pastaImportacaoFixa: '',
};
// ==================================================

`;
}

/** Origens de navegador autorizadas (CORS). Apps Android/iOS não usam CORS e não são afetados. */
const ORIGENS_PERMITIDAS = 'http://localhost:8081';

const SERVICOS = {
  google: {
    nome: 'O Google',
    dica404: 'Confira se o modelo ou a pasta existe e se a conta Google conectada ao n8n tem acesso a ele.',
    dica403: 'Verifique a credencial Google no n8n e se as APIs Google Drive e Google Docs estão ativadas.',
  },
  onedrive: {
    nome: 'O OneDrive',
    dica404: 'Confira o caminho do modelo e da pasta (ex.: /Causa/Modelos/Procuracao.docx) na conta Microsoft conectada ao n8n.',
    dica403: 'Verifique a credencial Microsoft Drive no n8n e se ela tem permissão Files.ReadWrite.All.',
  },
};

function codigo(nome, id, posicao, js) {
  return { parameters: { jsCode: js }, id, name: nome, type: 'n8n-nodes-base.code', typeVersion: 2, position: posicao };
}

function responder(nome, id, posicao, status) {
  return {
    parameters: {
      respondWith: 'json',
      responseBody: '={{ JSON.stringify($json.resposta) }}',
      options: { responseCode: status },
    },
    id,
    name: nome,
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1.1,
    position: posicao,
  };
}

function http(nome, id, posicao, credencial, { metodo, url, query, corpoJson, corpoBinario, respostaArquivo }) {
  const p = {
    method: metodo,
    url,
    authentication: 'predefinedCredentialType',
    nodeCredentialType: credencial,
    options: {},
  };
  if (query) {
    p.sendQuery = true;
    p.queryParameters = { parameters: query.map(([name, value]) => ({ name, value })) };
  }
  if (corpoJson) {
    p.sendBody = true;
    p.specifyBody = 'json';
    p.jsonBody = corpoJson;
  }
  if (corpoBinario) {
    p.sendBody = true;
    p.contentType = 'binaryData';
    p.inputDataFieldName = corpoBinario;
  }
  if (respostaArquivo) {
    p.options = { response: { response: { responseFormat: 'file', outputPropertyName: respostaArquivo } } };
  }
  return {
    parameters: p,
    id,
    name: nome,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: posicao,
    onError: 'continueErrorOutput',
  };
}

function webhook(caminho, idBase) {
  return {
    parameters: {
      httpMethod: 'POST',
      path: caminho,
      authentication: 'headerAuth',
      responseMode: 'responseNode',
      options: { allowedOrigins: ORIGENS_PERMITIDAS },
    },
    id: `${idBase}0001`,
    name: 'Webhook do Causa',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: [0, 300],
    webhookId: `${idBase}00ff`,
  };
}

function rota(idBase) {
  return {
    parameters: {
      mode: 'expression',
      numberOutputs: 5,
      output: "={{ ['ping', 'listar_arquivos', 'gerar_documento', 'erro', 'limite'].indexOf($json.rota) }}",
    },
    id: `${idBase}0003`,
    name: 'Rota',
    type: 'n8n-nodes-base.switch',
    typeVersion: 3,
    position: [440, 300],
  };
}

const liga = (destino) => [{ node: destino, type: 'main', index: 0 }];

function validar(provedor, idBase) {
  return codigo('Validar pedido', `${idBase}0002`, [220, 300], config(provedor) + ler('nos/comum/protecoes.js') + '\n' + ler(`nos/${provedor}/validar.js`));
}

function explicarErro(servico, idBase) {
  const definicao = `const SERVICO = ${JSON.stringify(SERVICOS[servico])};\n`;
  return [
    codigo('Explicar erro', `${idBase}0013`, [1340, 700], definicao + ler('nos/comum/explicar-erro.js')),
    responder('Responder erro do serviço', `${idBase}0014`, [1560, 700], 502),
  ];
}

function workflowGoogle() {
  const b = '6f1c2a10-0001-4c1a-9b10-c0ffee00';
  const cred = 'googleDocsOAuth2Api';
  const nodes = [
    webhook('causa', b),
    validar('google', b),
    rota(b),
    responder('Responder ping', `${b}0004`, [680, 0], 200),
    http('Listar arquivos do Drive', `${b}0005`, [680, 200], cred, {
      metodo: 'GET',
      url: 'https://www.googleapis.com/drive/v3/files',
      query: [
        ['q', '={{ $json.consulta }}'],
        ['fields', 'files(id,name,mimeType,webViewLink,modifiedTime)'],
        ['orderBy', 'modifiedTime desc'],
        ['pageSize', '50'],
        ['supportsAllDrives', 'true'],
        ['includeItemsFromAllDrives', 'true'],
      ],
    }),
    codigo('Formatar lista', `${b}0006`, [900, 200], ler('nos/google/formatar-lista.js')),
    responder('Responder lista', `${b}0007`, [1120, 200], 200),
    http('Copiar modelo', `${b}0008`, [680, 400], cred, {
      metodo: 'POST',
      url: '=https://www.googleapis.com/drive/v3/files/{{ $json.modeloId }}/copy',
      query: [
        ['supportsAllDrives', 'true'],
        ['fields', 'id,name,mimeType,webViewLink'],
      ],
      corpoJson: '={{ JSON.stringify({ name: $json.nomeArquivo, parents: [$json.pastaId] }) }}',
    }),
    http('Mesclar campos no Docs', `${b}0009`, [900, 400], cred, {
      metodo: 'POST',
      url: '=https://docs.googleapis.com/v1/documents/{{ $json.id }}:batchUpdate',
      corpoJson: "={{ JSON.stringify({ requests: $('Validar pedido').first().json.requisicoes }) }}",
    }),
    codigo('Formatar documento', `${b}0010`, [1120, 400], ler('nos/google/formatar-documento.js')),
    responder('Responder documento', `${b}0011`, [1340, 400], 200),
    responder('Responder erro', `${b}0012`, [680, 600], 400),
    responder('Responder limite', `${b}0019`, [680, 800], 429),
    ...explicarErro('google', b),
  ];
  const connections = {
    'Webhook do Causa': { main: [liga('Validar pedido')] },
    'Validar pedido': { main: [liga('Rota')] },
    Rota: {
      main: [liga('Responder ping'), liga('Listar arquivos do Drive'), liga('Copiar modelo'), liga('Responder erro'), liga('Responder limite')],
    },
    'Listar arquivos do Drive': { main: [liga('Formatar lista'), liga('Explicar erro')] },
    'Formatar lista': { main: [liga('Responder lista')] },
    'Copiar modelo': { main: [liga('Mesclar campos no Docs'), liga('Explicar erro')] },
    'Mesclar campos no Docs': { main: [liga('Formatar documento'), liga('Explicar erro')] },
    'Formatar documento': { main: [liga('Responder documento')] },
    'Explicar erro': { main: [liga('Responder erro do serviço')] },
  };
  return { name: 'Causa - Google Drive e Docs', nodes, connections };
}

function workflowOneDrive() {
  const b = '7a2d3b20-0002-4d2b-8c20-c0ffee00';
  const cred = 'microsoftOneDriveOAuth2Api';
  const nodes = [
    webhook('causa-onedrive', b),
    validar('onedrive', b),
    rota(b),
    responder('Responder ping', `${b}0004`, [680, 0], 200),
    http('Listar arquivos do OneDrive', `${b}0005`, [680, 200], cred, { metodo: 'GET', url: '={{ $json.url }}' }),
    codigo('Formatar lista', `${b}0006`, [900, 200], ler('nos/onedrive/formatar-lista.js')),
    responder('Responder lista', `${b}0007`, [1120, 200], 200),
    http('Baixar modelo', `${b}0008`, [680, 400], cred, {
      metodo: 'GET',
      url: '={{ $json.urlModelo }}',
      respostaArquivo: 'modelo',
    }),
    codigo('Preparar modelo', `${b}0015`, [900, 400], ler('nos/onedrive/preparar-modelo.js')),
    {
      parameters: { operation: 'decompress', binaryPropertyName: 'modelo', outputPrefix: 'parte_' },
      id: `${b}0016`,
      name: 'Abrir docx',
      type: 'n8n-nodes-base.compression',
      typeVersion: 1.1,
      position: [1120, 400],
    },
    codigo('Mesclar campos no Word', `${b}0009`, [1340, 400], `${mesclarDocx}\n${ler('nos/onedrive/mesclar.js')}`),
    {
      parameters: {
        operation: 'compress',
        binaryPropertyName: '={{ $json.partes }}',
        outputFormat: 'zip',
        fileName: "={{ $('Validar pedido').first().json.nome }}",
        binaryPropertyOutput: 'documento',
      },
      id: `${b}0017`,
      name: 'Montar docx',
      type: 'n8n-nodes-base.compression',
      typeVersion: 1.1,
      position: [1560, 400],
    },
    http('Salvar no OneDrive', `${b}0018`, [1780, 400], cred, {
      metodo: 'PUT',
      url: "={{ $('Validar pedido').first().json.urlDestino }}",
      corpoBinario: 'documento',
    }),
    codigo('Formatar documento', `${b}0010`, [2000, 400], ler('nos/onedrive/formatar-documento.js')),
    responder('Responder documento', `${b}0011`, [2220, 400], 200),
    responder('Responder erro', `${b}0012`, [680, 600], 400),
    responder('Responder limite', `${b}0019`, [680, 800], 429),
    ...explicarErro('onedrive', b),
  ];
  const connections = {
    'Webhook do Causa': { main: [liga('Validar pedido')] },
    'Validar pedido': { main: [liga('Rota')] },
    Rota: {
      main: [liga('Responder ping'), liga('Listar arquivos do OneDrive'), liga('Baixar modelo'), liga('Responder erro'), liga('Responder limite')],
    },
    'Listar arquivos do OneDrive': { main: [liga('Formatar lista'), liga('Explicar erro')] },
    'Formatar lista': { main: [liga('Responder lista')] },
    'Baixar modelo': { main: [liga('Preparar modelo'), liga('Explicar erro')] },
    'Preparar modelo': { main: [liga('Abrir docx')] },
    'Abrir docx': { main: [liga('Mesclar campos no Word')] },
    'Mesclar campos no Word': { main: [liga('Montar docx')] },
    'Montar docx': { main: [liga('Salvar no OneDrive')] },
    'Salvar no OneDrive': { main: [liga('Formatar documento'), liga('Explicar erro')] },
    'Formatar documento': { main: [liga('Responder documento')] },
    'Explicar erro': { main: [liga('Responder erro do serviço')] },
  };
  return { name: 'Causa - OneDrive e Word', nodes, connections };
}

for (const [arquivo, workflow] of [
  ['causa-google-drive.json', workflowGoogle()],
  ['causa-onedrive.json', workflowOneDrive()],
]) {
  const completo = { ...workflow, settings: { executionOrder: 'v1' }, pinData: {}, active: false };
  writeFileSync(join(pasta, arquivo), `${JSON.stringify(completo, null, 2)}\n`);
  console.log(`gerado ${arquivo} (${workflow.nodes.length} nós)`);
}
