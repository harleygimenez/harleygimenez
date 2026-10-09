// Proteções comuns aos webhooks do Causa (embutidas no início do nó "Validar pedido").
// CONFIG é definido logo abaixo, no próprio nó: ajuste ali os valores do seu escritório.

// Limite de requisições por minuto, contado no n8n (os dados estáticos do workflow
// só são gravados em execuções de produção, ou seja, com o workflow ativo).
const limitarTaxa = () => {
  const estado = $getWorkflowStaticData('global');
  const agora = Date.now();
  estado.chamadas = (Array.isArray(estado.chamadas) ? estado.chamadas : []).filter((t) => agora - t < 60_000);
  if (estado.chamadas.length >= CONFIG.limitePorMinuto) return false;
  estado.chamadas.push(agora);
  return true;
};

// Campos de mesclagem: objeto simples, chaves curtas, valores de texto com tamanho limitado.
const validarCampos = (campos) => {
  if (!campos || typeof campos !== 'object' || Array.isArray(campos)) return 'Campos de mesclagem inválidos.';
  const entradas = Object.entries(campos);
  if (entradas.length === 0) return 'Nenhum campo para mesclar.';
  if (entradas.length > 100) return 'Campos demais (máximo 100).';
  for (const [chave, valor] of entradas) {
    if (!/^[\w.]{1,60}$/.test(chave)) return `Nome de campo inválido: ${chave.slice(0, 60)}`;
    if (valor != null && typeof valor !== 'string' && typeof valor !== 'number') return `Valor inválido no campo ${chave}.`;
    if (String(valor ?? '').length > 10_000) return `Valor grande demais no campo ${chave}.`;
  }
  return null;
};

const muitasRequisicoes = () => [
  { json: { rota: 'limite', resposta: { erro: 'Muitas requisições ao n8n. Aguarde um minuto e tente de novo.' } } },
];
