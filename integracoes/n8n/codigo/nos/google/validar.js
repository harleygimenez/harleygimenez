// Valida o pedido do app Causa e decide a rota.
if (!limitarTaxa()) return muitasRequisicoes();
const corpo = $input.first().json.body ?? {};
const acao = String(corpo.acao ?? '');
const ehId = (v) => typeof v === 'string' && /^[\w-]{10,}$/.test(v);
const erro = (mensagem) => [{ json: { rota: 'erro', resposta: { erro: mensagem } } }];

if (acao === 'ping') {
  return [{ json: { rota: 'ping', resposta: { ok: true, versao: 1 } } }];
}

if (acao === 'listar_arquivos') {
  const pastaId = CONFIG.pastaImportacaoFixa || (corpo.pastaId ? String(corpo.pastaId) : '');
  if (pastaId && !ehId(pastaId)) return erro('ID de pasta inválido.');
  // Escapa a busca para a sintaxe de consulta do Drive.
  const busca = String(corpo.busca ?? '').slice(0, 100).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const filtros = ['trashed = false', "mimeType != 'application/vnd.google-apps.folder'"];
  if (pastaId) filtros.push(`'${pastaId}' in parents`);
  if (busca) filtros.push(`name contains '${busca}'`);
  return [{ json: { rota: 'listar_arquivos', consulta: filtros.join(' and ') } }];
}

if (acao === 'gerar_documento') {
  const { modeloId, nomeArquivo, campos } = corpo;
  const pastaId = CONFIG.pastaDestinoFixa || corpo.pastaId;
  if (!ehId(modeloId)) return erro('ID do modelo inválido.');
  if (!ehId(pastaId)) return erro('ID da pasta de destino inválido.');
  if (typeof nomeArquivo !== 'string' || !nomeArquivo.trim()) return erro('Informe o nome do arquivo.');
  const camposInvalidos = validarCampos(campos);
  if (camposInvalidos) return erro(camposInvalidos);

  // Cada campo vira um replaceAllText de {{chave}} no documento copiado.
  const requisicoes = Object.entries(campos).map(([chave, valor]) => ({
    replaceAllText: {
      containsText: { text: '{{' + chave + '}}', matchCase: true },
      replaceText: String(valor ?? ''),
    },
  }));

  return [{
    json: {
      rota: 'gerar_documento',
      modeloId,
      pastaId,
      nomeArquivo: nomeArquivo.trim().slice(0, 200),
      requisicoes,
    },
  }];
}

return erro(`Ação desconhecida: ${acao.slice(0, 40) || '(vazia)'}`);
