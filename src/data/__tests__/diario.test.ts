import type { Publicacao } from '../../lib/djen';
import { agruparPorProcesso, novoProcessoDoDiario, sugerirCliente, tipoPessoaPeloNome } from '../importacao';
import { linhaDoTempo } from '../selectors';
import { integracaoVazia, migrarDados, useDados } from '../store';
import type { Integracao } from '../types';

const HOJE = '2026-10-07';
const NUMERO = '00157865320188080035';
const OUTRO = '00012345620255050001';

function publicacao(campos: Partial<Publicacao>): Publicacao {
  return {
    chave: 'p1',
    dataDisponibilizacao: '2026-10-05',
    tribunal: 'TJES',
    tipoComunicacao: 'Intimação',
    tipoDocumento: 'Despacho',
    orgao: 'Vila Velha - 2ª Vara Cível',
    classe: 'PROCEDIMENTO COMUM CÍVEL',
    numeroProcesso: NUMERO,
    texto: 'Intime-se a parte autora para, no prazo de 15 (quinze) dias, apresentar réplica à contestação.',
    link: '',
    certidao: 'https://comunicaapi.pje.jus.br/api/v1/comunicacao/abcdef123/certidao',
    destinatarios: [{ nome: 'MARIA DA SILVA', polo: 'A' }],
    advogados: [{ nome: 'HARLEY GIMENEZ', oab: '12345', uf: 'ES' }],
    ...campos,
  };
}

const despacho = publicacao({});
const antiga = publicacao({
  chave: 'p0',
  dataDisponibilizacao: '2025-03-10',
  tipoDocumento: 'Sentença',
  texto: 'JULGO PROCEDENTE.',
  destinatarios: [
    { nome: 'MARIA DA SILVA', polo: 'A' },
    { nome: 'BANCO EXEMPLO S/A', polo: 'P' },
  ],
});
const trabalhista = publicacao({
  chave: 't1',
  numeroProcesso: OUTRO,
  tribunal: 'TRT5',
  classe: 'AÇÃO TRABALHISTA - RITO ORDINÁRIO',
  orgao: '1ª Vara do Trabalho de Salvador',
  tipoDocumento: 'Sentença',
  texto: 'Julgo improcedentes os pedidos.',
  destinatarios: [
    { nome: 'JOÃO PEREIRA', polo: 'A' },
    { nome: 'COMÉRCIO EXEMPLO LTDA', polo: 'P' },
  ],
});

beforeEach(() => {
  useDados.setState({
    clientes: [],
    processos: [],
    andamentos: [],
    compromissos: [],
    integracao: integracaoVazia,
  });
});

describe('importação do Diário', () => {
  it('agrupa por processo e sugere o cliente', () => {
    const grupos = agruparPorProcesso([antiga, trabalhista, despacho]);
    expect(grupos.map((g) => g.numero)).toEqual([NUMERO, OUTRO]);
    expect(grupos[0].publicacoes.map((p) => p.chave)).toEqual(['p1', 'p0']);
    expect(grupos[0].partes.map((p) => p.nome)).toEqual(['MARIA DA SILVA', 'BANCO EXEMPLO S/A']);
    expect(sugerirCliente(grupos[0])).toBe('MARIA DA SILVA');
    expect(sugerirCliente({ ...grupos[0], partes: [{ nome: 'BANCO EXEMPLO S/A', polo: 'P' }] })).toBe('BANCO EXEMPLO S/A');
    expect(tipoPessoaPeloNome('BANCO EXEMPLO S/A')).toBe('PJ');
    expect(tipoPessoaPeloNome('Comércio Exemplo Ltda')).toBe('PJ');
    expect(tipoPessoaPeloNome('Maria da Silva')).toBe('PF');
  });

  it('monta o processo com número, partes, área e fase prováveis', () => {
    const [, grupo] = agruparPorProcesso([despacho, trabalhista]);
    const p = novoProcessoDoDiario(grupo, 'c1', 'JOÃO PEREIRA');
    expect(p).toMatchObject({
      numero: '0001234-56.2025.5.05.0001',
      clienteId: 'c1',
      parteContraria: 'COMÉRCIO EXEMPLO LTDA',
      tribunal: 'TRT5',
      area: 'Trabalhista',
      etapa: 'sentenca',
      status: 'ativo',
    });
    expect(p.titulo).toBe('Ação trabalhista - rito ordinário — JOÃO PEREIRA');
  });

  it('cria clientes e processos, importa o inteiro teor e os prazos abertos sem duplicar', () => {
    const grupos = agruparPorProcesso([despacho, antiga, trabalhista]);
    const r = useDados.getState().importarDoDiario(
      grupos.map((g) => ({ processo: g, clienteNome: sugerirCliente(g) })),
      HOJE,
    );
    expect(r).toEqual({ processosNovos: 2, clientesNovos: 2, andamentos: 3, prazos: 3 });

    const s = useDados.getState();
    expect(s.clientes.map((c) => [c.nome, c.tipo])).toEqual([
      ['MARIA DA SILVA', 'PF'],
      ['JOÃO PEREIRA', 'PF'],
    ]);
    const processo = s.processos.find((p) => p.numero === '0015786-53.2018.8.08.0035')!;
    expect(processo.clienteId).toBe(s.clientes[0].id);

    // Timeline com o texto publicado e a certidão.
    const [item] = linhaDoTempo(s, processo.id);
    expect(item).toMatchObject({ tipo: 'compromisso' });
    const publicado = linhaDoTempo(s, processo.id).find((i) => i.tipo === 'andamento')!;
    expect(publicado.titulo).toBe('Despacho · Diário (DJEN)');
    expect(publicado.item).toMatchObject({
      inteiroTeor: despacho.texto,
      link: despacho.certidao,
    });

    // Só os prazos ainda abertos entram na agenda: a réplica do despacho e os recursos da
    // sentença trabalhista de 05/10. Os da sentença de 2025 já venceram e ficam só na timeline.
    const prazos = s.compromissos.map((c) => [c.titulo, c.data, c.processoId === processo.id]);
    expect(prazos).toEqual([
      ['Réplica (15 dias úteis)', '2026-10-28', true],
      ['Recurso ordinário (8 dias úteis)', '2026-10-19', false],
      ['Embargos de declaração (5 dias úteis)', '2026-10-14', false],
    ]);
    expect(s.compromissos.every((c) => c.tipo === 'prazo' && c.prioridade === 'alta' && !c.concluido)).toBe(true);
    expect(s.compromissos[0].descricao).toContain('Disponibilizado no DJEN em 05/10/2026, publicado em 06/10/2026');

    // Reimportar não duplica nada, nem recria prazo excluído.
    useDados.getState().excluirCompromisso(s.compromissos[0].id);
    const deNovo = useDados.getState().importarDoDiario(
      grupos.map((g) => ({ processo: g, clienteNome: sugerirCliente(g) })),
      HOJE,
    );
    expect(deNovo).toEqual({ processosNovos: 0, clientesNovos: 0, andamentos: 0, prazos: 0 });
    expect(useDados.getState().compromissos).toHaveLength(2);
  });

  it('reaproveita cliente com o mesmo nome e não cria prazos se desligado', () => {
    useDados.setState({ integracao: { ...integracaoVazia, prazosAutomaticos: false } });
    useDados.getState().salvarCliente({
      tipo: 'PF',
      nome: 'Maria da Silva',
      documento: '',
      email: '',
      telefone: '',
      endereco: '',
      observacoes: '',
      criadoEm: '',
    });
    const [grupo] = agruparPorProcesso([despacho]);
    const r = useDados.getState().importarDoDiario([{ processo: grupo, clienteNome: 'MARIA DA SILVA' }], HOJE);
    expect(r).toMatchObject({ clientesNovos: 0, processosNovos: 1, andamentos: 1, prazos: 0 });
    expect(useDados.getState().clientes).toHaveLength(1);
  });

  it('migra para a versão 4 com prazos automáticos ligados e equipe vazia', () => {
    const v4 = migrarDados({ integracao: { google: {}, onedrive: {}, chaveDataJud: '' } }, 3) as {
      integracao: Integracao;
      equipe: unknown[];
    };
    expect(v4.integracao.prazosAutomaticos).toBe(true);
    expect(v4.equipe).toEqual([]);
  });
});
