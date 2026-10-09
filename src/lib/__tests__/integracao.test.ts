import type { Cliente, Conexao, Processo } from '../../data/types';
import { extrairIdGoogle } from '../google';
import { camposDeMesclagem, CAMPOS_DISPONIVEIS, nomeArquivoPadrao } from '../mesclagem';
import { CABECALHO_TOKEN, ErroIntegracao, gerarDocumento, listarArquivos, testarConexao } from '../n8n';

const ID = '1AbC_def-GHIjklMNOpqrSTUvwxYZ0123456789';

describe('extrairIdGoogle', () => {
  it('reconhece links de documentos, arquivos e pastas', () => {
    expect(extrairIdGoogle(`https://docs.google.com/document/d/${ID}/edit?usp=sharing`)).toBe(ID);
    expect(extrairIdGoogle(`https://drive.google.com/file/d/${ID}/view`)).toBe(ID);
    expect(extrairIdGoogle(`https://drive.google.com/drive/folders/${ID}?usp=drive_link`)).toBe(ID);
    expect(extrairIdGoogle(`https://drive.google.com/drive/u/0/folders/${ID}`)).toBe(ID);
    expect(extrairIdGoogle(`https://drive.google.com/open?id=${ID}`)).toBe(ID);
  });

  it('aceita um ID puro e rejeita o resto', () => {
    expect(extrairIdGoogle(`  ${ID} `)).toBe(ID);
    expect(extrairIdGoogle('https://exemplo.com/qualquer')).toBe('');
    expect(extrairIdGoogle('')).toBe('');
  });
});

const cliente: Cliente = {
  id: 'c1',
  tipo: 'PJ',
  nome: 'Construtora Horizonte Ltda.',
  documento: '12.345.678/0001-95',
  email: 'juridico@horizonte.com',
  telefone: '(11) 3456-7890',
  endereco: 'Av. Paulista, 1500',
  observacoes: '',
  criadoEm: '',
};

const processo: Processo = {
  id: 'p1',
  numero: '0001234-13.2020.8.26.0100',
  titulo: 'Ação de cobrança',
  clienteId: 'c1',
  parteContraria: 'Vale Verde Ltda.',
  tribunal: 'TJSP',
  orgao: '12ª Vara Cível',
  area: 'Cível',
  etapa: 'sentenca',
  status: 'ativo',
  valorCausa: 42_000_000,
  observacoes: '',
  criadoEm: '',
};

const perfil = { nome: 'Dra. Joana Souza', oab: 'OAB/SP 123.456', email: '', telefone: '', cidade: 'São Paulo/SP' };

describe('campos de mesclagem', () => {
  it('preenche cliente, processo, advogado e datas', () => {
    const campos = camposDeMesclagem({ cliente, processo, perfil, hoje: '2026-10-09' });
    expect(campos).toMatchObject({
      'cliente.nome': 'Construtora Horizonte Ltda.',
      'cliente.tipo_documento': 'CNPJ',
      'processo.numero': '0001234-13.2020.8.26.0100',
      'processo.fase': 'Sentença',
      'processo.valor_causa': 'R$ 420.000,00',
      'advogado.oab': 'OAB/SP 123.456',
      'data.hoje': '09/10/2026',
      'data.extenso': '9 de outubro de 2026',
    });
  });

  it('gera exatamente os campos documentados, vazios quando não se aplicam', () => {
    const campos = camposDeMesclagem({ perfil, hoje: '2026-10-09' });
    expect(Object.keys(campos).sort()).toEqual(CAMPOS_DISPONIVEIS.map((c) => c.chave).sort());
    expect(campos['cliente.nome']).toBe('');
    expect(campos['processo.fase']).toBe('');
  });

  it('sugere o nome do arquivo', () => {
    const modelo = { id: 'm', nome: 'Procuração', provedor: 'google' as const, arquivoId: ID, descricao: '' };
    expect(nomeArquivoPadrao(modelo, cliente, '2026-10-09')).toBe('Procuração - Construtora Horizonte Ltda. - 09-10-2026');
    expect(nomeArquivoPadrao(modelo, undefined, '2026-10-09')).toBe('Procuração - 09-10-2026');
  });
});

describe('cliente do n8n', () => {
  const config: Conexao = {
    webhookUrl: 'https://n8n.exemplo.com/webhook/openjus',
    token: 'segredo',
    pastaDestinoId: ID,
    pastaImportacaoId: '',
  };

  function respostaFalsa(status: number, corpo: unknown) {
    return jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(typeof corpo === 'string' ? corpo : JSON.stringify(corpo)),
    });
  }

  it('envia a ação, o token e os dados', async () => {
    const buscar = respostaFalsa(200, { arquivo: { id: 'novo', nome: 'Doc', url: 'https://x', mimeType: 'm' } });
    const arquivo = await gerarDocumento(
      config,
      { modeloId: ID, nomeArquivo: 'Doc', campos: { 'cliente.nome': 'Ana' } },
      { fetch: buscar },
    );
    expect(arquivo.id).toBe('novo');
    const [url, init] = buscar.mock.calls[0];
    expect(url).toBe(config.webhookUrl);
    expect(init.method).toBe('POST');
    expect(init.headers[CABECALHO_TOKEN]).toBe('segredo');
    expect(JSON.parse(init.body)).toEqual({
      acao: 'gerar_documento',
      modeloId: ID,
      nomeArquivo: 'Doc',
      campos: { 'cliente.nome': 'Ana' },
      pastaId: ID,
    });
  });

  it('testa a conexão e lista arquivos', async () => {
    await expect(testarConexao(config, { fetch: respostaFalsa(200, { ok: true, versao: 1 }) })).resolves.toEqual({ versao: 1 });
    const buscar = respostaFalsa(200, { arquivos: [{ id: 'a', nome: 'Contrato.pdf', url: 'https://drive.google.com/file/d/a', mimeType: 'application/pdf' }] });
    const arquivos = await listarArquivos(config, { busca: ' contrato ', pastaId: ID }, { fetch: buscar });
    expect(arquivos).toHaveLength(1);
    expect(JSON.parse(buscar.mock.calls[0][1].body)).toEqual({ acao: 'listar_arquivos', busca: 'contrato', pastaId: ID });
  });

  it('traduz erros em mensagens úteis', async () => {
    await expect(testarConexao(config, { fetch: respostaFalsa(403, '') })).rejects.toThrow('recusou o token');
    await expect(testarConexao(config, { fetch: respostaFalsa(404, '') })).rejects.toThrow('Webhook não encontrado');
    await expect(testarConexao(config, { fetch: respostaFalsa(400, { erro: 'ID do modelo inválido.' }) })).rejects.toThrow(
      'ID do modelo inválido.',
    );
    await expect(testarConexao(config, { fetch: respostaFalsa(200, '<html>') })).rejects.toThrow('não é JSON');
    await expect(
      testarConexao(config, { fetch: jest.fn().mockRejectedValue(new Error('Network request failed')) }),
    ).rejects.toThrow('Não foi possível conectar');
  });

  it('não chama o n8n sem configuração', async () => {
    const buscar = jest.fn();
    await expect(testarConexao({ ...config, webhookUrl: '' }, { fetch: buscar })).rejects.toBeInstanceOf(ErroIntegracao);
    await expect(testarConexao({ ...config, webhookUrl: 'n8n.local' }, { fetch: buscar })).rejects.toThrow('https://');
    await expect(
      gerarDocumento({ ...config, pastaDestinoId: '' }, { modeloId: ID, nomeArquivo: 'x', campos: {} }, { fetch: buscar }),
    ).rejects.toThrow('pasta para documentos gerados');
    expect(buscar).not.toHaveBeenCalled();
  });

  it('desiste quando o n8n demora demais', async () => {
    const pendurado = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_ok, falha) => init.signal?.addEventListener('abort', () => falha(new Error('aborted')))),
    );
    await expect(testarConexao(config, { fetch: pendurado as unknown as typeof fetch, timeoutMs: 10 })).rejects.toThrow(
      'demorou demais',
    );
  });
});
