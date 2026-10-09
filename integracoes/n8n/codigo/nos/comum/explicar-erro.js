// Transforma a falha da API do Google ou da Microsoft em uma mensagem para o app.
// SERVICO ({ nome, dica404, dica403 }) é definido no topo pelo gerar-workflows.mjs.
const item = $input.first().json;
const e = item.error ?? item;
const codigo = String(e.httpCode ?? e.status ?? '');
// O corpo de erro ({"error":{"message":...}}) pode vir embutido e escapado na mensagem.
const extrair = (texto) => {
  if (typeof texto !== 'string') return '';
  const json = texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1);
  for (const candidato of [texto, json, json.replace(/\\"/g, '"')]) {
    try {
      const valor = JSON.parse(candidato);
      if (valor && valor.error && valor.error.message) return valor.error.message;
    } catch (e) {}
  }
  return '';
};
const detalhe = extrair(e.description) || extrair(e.message) || e.message || 'erro desconhecido';
let dica = '';
if (codigo === '404') dica = ` ${SERVICO.dica404}`;
if (codigo === '401' || codigo === '403') dica = ` ${SERVICO.dica403}`;
return [{ json: { resposta: { erro: `${SERVICO.nome} recusou o pedido (${codigo || 'sem código'}): ${detalhe.replace(/\.+$/, '')}.${dica}` } } }];
