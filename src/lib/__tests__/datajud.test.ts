import { useDados } from '../../data/store';
import { linhaDoTempo } from '../../data/selectors';
import {
  aliasTribunal,
  andamentoDoMovimento,
  CHAVE_PUBLICA_DATAJUD,
  consultarDataJud,
  converterResposta,
  lerDataDataJud,
  tipoDoMovimento,
  type RespostaDataJud,
} from '../datajud';
import { normalizarCaminhoOneDrive, validarModelo } from '../armazenamento';

// Número enviado para teste (TJES). A resposta abaixo é fictícia: segue o formato documentado
// da API pública do DataJud, mas não reproduz dados reais do processo.
const NUMERO = '0015786-53.2018.8.08.0035';

const RESPOSTA: RespostaDataJud = {
  hits: {
    hits: [
      {
        _source: {
          numeroProcesso: '00157865320188080035',
          tribunal: 'TJES',
          grau: 'G1',
          classe: { codigo: 7, nome: 'Procedimento Comum Cível' },
          assuntos: [{ codigo: 10433, nome: 'Indenização por Dano Moral' }],
          orgaoJulgador: { codigo: 1, nome: 'Vila Velha - 1ª Vara Cível' },
          sistema: { codigo: 1, nome: 'PJe' },
          dataAjuizamento: '20180315000000',
          dataHoraUltimaAtualizacao: '2024-05-10T12:00:00.000Z',
          nivelSigilo: 0,
          movimentos: [
            { codigo: 26, nome: 'Distribuição', dataHora: '2018-03-15T10:00:00.000Z' },
            {
              codigo: 85,
              nome: 'Petição',
              dataHora: '2018-06-01T14:30:00.000Z',
              complementosTabelados: [{ codigo: 19, valor: 57, nome: 'Contestação', descricao: 'tipo_de_peticao' }],
            },
            { codigo: 219, nome: 'Procedência em Parte', dataHora: '2019-08-20T16:00:00.000Z' },
          ],
        },
      },
      {
        _source: {
          numeroProcesso: '00157865320188080035',
          tribunal: 'TJES',
          grau: 'G2',
          classe: { codigo: 198, nome: 'Apelação Cível' },
          assuntos: [[{ codigo: 10433, nome: 'Indenização por Dano Moral' }], { codigo: 7779, nome: 'Indenização por Dano Material' }],
          orgaoJulgador: { codigo: 2, nome: '3ª Câmara Cível' },
          dataHoraUltimaAtualizacao: '2025-02-01T09:00:00.000Z',
          movimentos: [
            { codigo: 22, nome: 'Baixa Definitiva', dataHora: '2025-01-30T09:00:00.000Z' },
            { codigo: 22, nome: 'Baixa Definitiva', dataHora: '2025-01-30T09:00:00.000Z' },
            { codigo: 51, nome: 'Sem data' },
          ],
        },
      },
    ],
  },
};

describe('DataJud', () => {
  it('descobre o índice do tribunal pelo número CNJ', () => {
    expect(aliasTribunal(NUMERO)).toBe('tjes');
    expect(aliasTribunal('0001234-13.2020.8.26.0100')).toBe('tjsp');
    expect(aliasTribunal('0000001-00.2020.8.07.0001')).toBe('tjdft');
    expect(aliasTribunal('1001234-51.2025.5.02.0031')).toBe('trt2');
    expect(aliasTribunal('0000001-00.2020.5.00.0000')).toBe('tst');
    expect(aliasTribunal('0000001-00.2020.4.03.6100')).toBe('trf3');
    expect(aliasTribunal('0000001-00.2020.6.26.0001')).toBe('tre-sp');
    expect(aliasTribunal('0000001-00.2020.9.13.0001')).toBe('tjmmg');
    expect(aliasTribunal('0000001-00.2020.1.00.0000')).toBeNull();
    expect(aliasTribunal('123')).toBeNull();
  });

  it('lê os formatos de data usados pelo DataJud', () => {
    expect(lerDataDataJud('20180315000000')).toBe('2018-03-15');
    expect(lerDataDataJud('2018-03-15')).toBe('2018-03-15');
    expect(lerDataDataJud('2018-03-15T12:00:00.000Z')).toBe('2018-03-15');
    expect(lerDataDataJud('')).toBe('');
    expect(lerDataDataJud('lixo')).toBe('');
  });

  it('junta os graus, remove movimentos repetidos e ordena do mais recente', () => {
    const p = converterResposta(RESPOSTA)!;
    expect(p).toMatchObject({
      tribunal: 'TJES',
      graus: ['G1', 'G2'],
      classe: 'Apelação Cível',
      orgaoJulgador: '3ª Câmara Cível',
      dataAjuizamento: '2018-03-15',
      sigiloso: false,
      assuntos: ['Indenização por Dano Moral', 'Indenização por Dano Material'],
    });
    expect(p.movimentos.map((m) => m.nome)).toEqual(['Baixa Definitiva', 'Procedência em Parte', 'Petição', 'Distribuição']);
    expect(p.movimentos[2].descricao).toBe('tipo de peticao: Contestação');
    expect(converterResposta({ hits: { hits: [] } })).toBeNull();
  });

  it('classifica movimentos e monta andamentos', () => {
    expect(tipoDoMovimento('Procedência em Parte')).toBe('sentenca');
    expect(tipoDoMovimento('Concessão de Liminar')).toBe('decisao');
    expect(tipoDoMovimento('Mero expediente')).toBe('despacho');
    expect(tipoDoMovimento('Juntada de Petição')).toBe('peticao');
    expect(tipoDoMovimento('Disponibilização no Diário da Justiça Eletrônico')).toBe('publicacao');
    expect(tipoDoMovimento('Distribuição')).toBe('andamento');

    const [baixa] = converterResposta(RESPOSTA)!.movimentos;
    expect(andamentoDoMovimento(baixa)).toEqual({
      data: '2025-01-30',
      tipo: 'andamento',
      descricao: 'Baixa Definitiva [2º grau]',
      chaveExterna: 'datajud:G2|22|2025-01-30T09:00:00.000Z',
    });
  });

  it('consulta o índice certo com a chave pública e o número só com dígitos', async () => {
    const buscar = jest.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(RESPOSTA) });
    const p = await consultarDataJud(NUMERO, { fetch: buscar });
    expect(p?.tribunal).toBe('TJES');
    const [url, init] = buscar.mock.calls[0];
    expect(url).toBe('https://api-publica.datajud.cnj.jus.br/api_publica_tjes/_search');
    expect(init.headers.Authorization).toBe(`APIKey ${CHAVE_PUBLICA_DATAJUD}`);
    expect(JSON.parse(init.body)).toEqual({ query: { match: { numeroProcesso: '00157865320188080035' } }, size: 10 });
  });

  it('explica falhas', async () => {
    const resposta = (status: number) => jest.fn().mockResolvedValue({ ok: false, status, json: () => Promise.resolve({}) });
    await expect(consultarDataJud('0015786-54.2018.8.08.0035')).rejects.toThrow('Número CNJ inválido');
    await expect(consultarDataJud(NUMERO, { fetch: resposta(401) })).rejects.toThrow('recusou a chave');
    await expect(consultarDataJud(NUMERO, { fetch: resposta(500) })).rejects.toThrow('erro 500');
    await expect(
      consultarDataJud(NUMERO, { fetch: jest.fn().mockRejectedValue(new TypeError('Failed to fetch')) }),
    ).rejects.toThrow('Não foi possível acessar o DataJud');
  });

  it('importa só movimentos novos para a timeline do processo', () => {
    useDados.getState().carregarExemplo();
    const processo = useDados.getState().processos[0];
    const dados = converterResposta(RESPOSTA)!;

    expect(useDados.getState().importarDataJud(processo.id, dados)).toBe(4);
    expect(useDados.getState().importarDataJud(processo.id, dados)).toBe(0);

    const atualizado = useDados.getState().processos.find((p) => p.id === processo.id)!;
    expect(atualizado.datajud).toMatchObject({ classe: 'Apelação Cível', graus: ['G1', 'G2'] });
    const titulos = linhaDoTempo(useDados.getState(), processo.id).map((i) => i.titulo);
    expect(titulos).toContain('Sentença · DataJud');
  });
});

describe('caminhos e modelos do OneDrive', () => {
  it('normaliza caminhos', () => {
    expect(normalizarCaminhoOneDrive('Causa\\Modelos\\')).toBe('/Causa/Modelos');
    expect(normalizarCaminhoOneDrive(' /Causa//Documentos/ ')).toBe('/Causa/Documentos');
    expect(normalizarCaminhoOneDrive('/')).toBe('/');
    expect(normalizarCaminhoOneDrive('')).toBe('');
    expect(normalizarCaminhoOneDrive('/Causa/../Segredos')).toBe('');
    expect(normalizarCaminhoOneDrive('/Causa/a:b')).toBe('');
  });

  it('valida modelos por provedor', () => {
    expect(validarModelo('onedrive', '/Causa/Modelos/Procuração.docx')).toBeNull();
    expect(validarModelo('onedrive', '/Causa/Modelos/Procuração.pdf')).toMatch('.docx');
    expect(validarModelo('onedrive', '')).toMatch('caminho');
    expect(validarModelo('google', 'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/edit')).toBeNull();
    expect(validarModelo('google', 'qualquer coisa')).toMatch('Google Docs');
  });
});
