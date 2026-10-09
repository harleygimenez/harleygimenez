// Testa a segurança de um webhook do Causa no n8n, sem alterar nada no Drive/OneDrive:
// só envia ping, listagens e pedidos inválidos (que devem ser recusados).
//
// Uso:
//   CAUSA_WEBHOOK=https://seu-n8n.com/webhook/causa CAUSA_TOKEN=... node integracoes/n8n/testar-seguranca.mjs
// Opcional: CAUSA_ORIGEM_PERMITIDA=https://app.seu-dominio.com (origem web autorizada no CORS)
//           CAUSA_PULAR_LIMITE=1 (não testa o limite de requisições, que envia ~70 chamadas)

const url = process.env.CAUSA_WEBHOOK;
const token = process.env.CAUSA_TOKEN;
if (!url || !token) {
  console.error('Defina CAUSA_WEBHOOK e CAUSA_TOKEN.');
  process.exit(2);
}
const onedrive = url.includes('onedrive');

let falhas = 0;
function verificar(condicao, descricao, detalhe = '') {
  console.log(`${condicao ? 'OK   ' : 'FALHA'} ${descricao}${!condicao && detalhe ? `\n      ${detalhe}` : ''}`);
  if (!condicao) falhas++;
}

async function chamar(corpo, { cabecalhos = {}, comToken = true, bruto } = {}) {
  const resposta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(comToken ? { 'X-Causa-Token': token } : {}), ...cabecalhos },
    body: bruto ?? JSON.stringify(corpo),
  });
  const texto = await resposta.text();
  let json;
  try {
    json = JSON.parse(texto);
  } catch {
    json = undefined;
  }
  return { status: resposta.status, texto, json, cabecalhos: resposta.headers };
}

const semDetalhesInternos = (texto) => !/\bat .+:\d+:\d+|node_modules|Error: .+\n\s+at /.test(texto);

// 12. Webhook validado: sem token ou com token errado deve ser recusado.
{
  const semToken = await chamar({ acao: 'ping' }, { comToken: false });
  verificar(semToken.status === 401 || semToken.status === 403, 'recusa chamada sem token', `HTTP ${semToken.status}`);
  const errado = await chamar({ acao: 'ping' }, { cabecalhos: { 'X-Causa-Token': `${token}x` } });
  verificar(errado.status === 401 || errado.status === 403, 'recusa token errado', `HTTP ${errado.status}`);
  const ok = await chamar({ acao: 'ping' });
  verificar(ok.status === 200 && ok.json?.ok === true, 'aceita token correto', `HTTP ${ok.status} ${ok.texto}`);
}

// 9. CORS: uma origem qualquer não pode receber permissão de leitura no navegador.
{
  const r = await fetch(url, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://site-malicioso.exemplo',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,x-causa-token',
    },
  });
  const permitida = r.headers.get('access-control-allow-origin');
  verificar(permitida !== '*' && permitida !== 'https://site-malicioso.exemplo', 'CORS não libera origem desconhecida', `Access-Control-Allow-Origin: ${permitida}`);
  if (process.env.CAUSA_ORIGEM_PERMITIDA) {
    const ok = await fetch(url, {
      method: 'OPTIONS',
      headers: { Origin: process.env.CAUSA_ORIGEM_PERMITIDA, 'Access-Control-Request-Method': 'POST' },
    });
    verificar(ok.headers.get('access-control-allow-origin') === process.env.CAUSA_ORIGEM_PERMITIDA, 'CORS libera a origem do app web');
  }
}

// 5/6. Entradas maliciosas ou inválidas devem ser recusadas com 400, sem detalhes internos.
const invalidos = [
  ['ação desconhecida', { acao: 'apagar_tudo' }],
  ['ação gigante', { acao: 'x'.repeat(5000) }],
  ['pasta com injeção na consulta', { acao: 'listar_arquivos', pastaId: onedrive ? '/../../' : "x' in parents or '1'='1" }],
  ['modelo com injeção', { acao: 'gerar_documento', modeloId: onedrive ? '/a/../b.docx' : "abc'; drop", pastaId: onedrive ? '/Causa' : 'pasta1234567', nomeArquivo: 'x', campos: { a: 'b' } }],
  ['campos demais', { acao: 'gerar_documento', modeloId: onedrive ? '/m.docx' : 'modelo12345', pastaId: onedrive ? '/Causa' : 'pasta1234567', nomeArquivo: 'x', campos: Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`c${i}`, 'v'])) }],
  ['valor de campo gigante', { acao: 'gerar_documento', modeloId: onedrive ? '/m.docx' : 'modelo12345', pastaId: onedrive ? '/Causa' : 'pasta1234567', nomeArquivo: 'x', campos: { a: 'x'.repeat(20_000) } }],
  ['nome de campo com código', { acao: 'gerar_documento', modeloId: onedrive ? '/m.docx' : 'modelo12345', pastaId: onedrive ? '/Causa' : 'pasta1234567', nomeArquivo: 'x', campos: { '<script>': 'x' } }],
  ['campo com objeto', { acao: 'gerar_documento', modeloId: onedrive ? '/m.docx' : 'modelo12345', pastaId: onedrive ? '/Causa' : 'pasta1234567', nomeArquivo: 'x', campos: { a: { $ne: 1 } } }],
];
for (const [descricao, corpo] of invalidos) {
  const r = await chamar(corpo);
  verificar(r.status === 400 && typeof r.json?.erro === 'string' && r.texto.length < 500, `recusa ${descricao}`, `HTTP ${r.status} ${r.texto.slice(0, 200)}`);
}

// 5. Busca com aspas e barras não pode quebrar a consulta (tem de responder normalmente).
{
  const r = await chamar({ acao: 'listar_arquivos', busca: `a' or name contains 'b\\' or '1'='1` });
  verificar(r.status === 200 && Array.isArray(r.json?.arquivos), 'busca com aspas é tratada como texto', `HTTP ${r.status} ${r.texto.slice(0, 200)}`);
}

// 13. Corpo malformado não pode devolver stack trace.
{
  const r = await chamar(undefined, { bruto: '{"acao": "ping", ' });
  verificar(r.status >= 400 && semDetalhesInternos(r.texto), 'JSON malformado não expõe detalhes internos', `HTTP ${r.status} ${r.texto.slice(0, 200)}`);
}

// 4. Limite de requisições.
if (!process.env.CAUSA_PULAR_LIMITE) {
  const respostas = [];
  for (let i = 0; i < 70; i++) respostas.push((await chamar({ acao: 'ping' })).status);
  verificar(respostas.includes(429), 'limita rajadas de requisições (HTTP 429)', `códigos: ${[...new Set(respostas)].join(', ')}`);
  const r429 = await chamar({ acao: 'ping' });
  verificar(r429.status !== 429 || /Aguarde/.test(r429.json?.erro ?? ''), 'resposta 429 explica o motivo');
}

console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : '\nTodas as verificações passaram.');
process.exit(falhas ? 1 : 0);
