// Valida o pedido do app Causa e decide a rota. No OneDrive, modelos e pastas
// são caminhos a partir da raiz do seu OneDrive, como "/Causa/Modelos/Procuracao.docx".
const corpo = $input.first().json.body ?? {};
const acao = String(corpo.acao ?? '');
const GRAPH = 'https://graph.microsoft.com/v1.0/me/drive';
const erro = (mensagem) => [{ json: { rota: 'erro', resposta: { erro: mensagem } } }];

// Caminho absoluto, sem "..", sem caracteres proibidos no OneDrive.
const ehCaminho = (v) =>
  typeof v === 'string' && /^\/[^"*:<>?\\|#%]*$/.test(v) && !v.split('/').some((p) => p === '..' || p === '.');
const codificar = (caminho) =>
  caminho.split('/').filter(Boolean).map(encodeURIComponent).join('/');
const itemDoCaminho = (caminho) => (codificar(caminho) ? `${GRAPH}/root:/${codificar(caminho)}:` : `${GRAPH}/root`);

if (acao === 'ping') {
  return [{ json: { rota: 'ping', resposta: { ok: true, versao: 1, provedor: 'onedrive' } } }];
}

if (acao === 'listar_arquivos') {
  const pasta = corpo.pastaId ? String(corpo.pastaId) : '/';
  if (!ehCaminho(pasta)) return erro('Caminho de pasta inválido. Use algo como /Causa/Documentos.');
  const busca = String(corpo.busca ?? '').trim().slice(0, 100);
  const campos = '$select=id,name,webUrl,file,folder,lastModifiedDateTime&$top=100';
  const url = busca
    ? `${itemDoCaminho(pasta)}/search(q='${encodeURIComponent(busca.replace(/'/g, "''"))}')?${campos}`
    : `${itemDoCaminho(pasta)}/children?${campos}`;
  return [{ json: { rota: 'listar_arquivos', url } }];
}

if (acao === 'gerar_documento') {
  const { modeloId, pastaId, nomeArquivo, campos } = corpo;
  if (!ehCaminho(modeloId) || !/\.docx$/i.test(modeloId)) {
    return erro('O modelo deve ser o caminho de um arquivo .docx no OneDrive, como /Causa/Modelos/Procuracao.docx.');
  }
  if (!ehCaminho(pastaId)) return erro('Caminho da pasta de destino inválido. Use algo como /Causa/Documentos.');
  if (typeof nomeArquivo !== 'string' || !nomeArquivo.trim()) return erro('Informe o nome do arquivo.');
  if (!campos || typeof campos !== 'object' || Array.isArray(campos)) return erro('Campos de mesclagem inválidos.');

  const nome = `${nomeArquivo.trim().replace(/[\\/"*:<>?|#%]/g, '-').slice(0, 200)}.docx`;
  const destino = `${pastaId.replace(/\/+$/, '')}/${nome}`;
  return [{
    json: {
      rota: 'gerar_documento',
      urlModelo: `${itemDoCaminho(modeloId)}/content`,
      urlDestino: `${itemDoCaminho(destino)}/content?@microsoft.graph.conflictBehavior=rename`,
      nome,
      campos,
    },
  }];
}

return erro(`Ação desconhecida: ${acao || '(vazia)'}`);
