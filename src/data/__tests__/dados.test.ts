import AsyncStorage from '@react-native-async-storage/async-storage';

import { validarCnj } from '../../lib/cnj';
import { criarDadosExemplo } from '../seed';
import {
  buscarProcessos,
  compromissosAtrasados,
  compromissosProximos,
  lancamentosDoMes,
  linhaDoTempo,
  resumirLancamentos,
} from '../selectors';
import { useDados } from '../store';

const HOJE = '2026-10-09';
let contador = 0;
const exemplo = () => criarDadosExemplo(HOJE, () => `id${contador++}`);

describe('dados de exemplo', () => {
  it('usam números CNJ válidos e referências consistentes', () => {
    const d = exemplo();
    const clientes = new Set(d.clientes.map((c) => c.id));
    const processos = new Set(d.processos.map((p) => p.id));
    for (const p of d.processos) {
      if (p.numero) expect(validarCnj(p.numero)).toBe(true);
      expect(clientes.has(p.clienteId)).toBe(true);
    }
    for (const c of d.compromissos) if (c.processoId) expect(processos.has(c.processoId)).toBe(true);
  });
});

describe('seletores', () => {
  it('separa compromissos atrasados e próximos', () => {
    const d = exemplo();
    expect(compromissosAtrasados(d.compromissos, HOJE).map((c) => c.titulo)).toEqual([
      'Contrarrazões ao recurso de embargos',
    ]);
    const proximos = compromissosProximos(d.compromissos, 7, HOJE);
    expect(proximos[0].titulo).toBe('Rol de testemunhas');
    expect(proximos.every((c) => !c.concluido && c.data >= HOJE)).toBe(true);
  });

  it('resume o financeiro do mês', () => {
    const d = exemplo();
    const r = resumirLancamentos(lancamentosDoMes(d.lancamentos, HOJE), HOJE);
    expect(r.recebido).toBe(450_000);
    expect(r.pago).toBe(18_900);
    expect(r.saldo).toBe(450_000 - 18_900);
    expect(r.vencido).toBe(120_000);
  });

  it('busca processos por cliente, título e número', () => {
    const d = exemplo();
    expect(buscarProcessos(d, 'construtora')).toHaveLength(2);
    expect(buscarProcessos(d, 'familia')).toHaveLength(1);
    expect(buscarProcessos(d, '0804512')).toHaveLength(1);
    expect(buscarProcessos(d, '')).toHaveLength(d.processos.length);
  });

  it('monta a linha do tempo do mais recente para o mais antigo', () => {
    const d = exemplo();
    const processo = d.processos.find((p) => p.area === 'Trabalhista')!;
    const itens = linhaDoTempo(d, processo.id);
    expect(itens.length).toBeGreaterThan(4);
    expect(itens.map((i) => i.data)).toEqual([...itens.map((i) => i.data)].sort().reverse());
    expect(new Set(itens.map((i) => i.tipo))).toEqual(new Set(['andamento', 'compromisso']));
  });
});

describe('store', () => {
  beforeEach(() => useDados.getState().apagarTudo());

  it('registra a mudança de fase na linha do tempo', () => {
    const s = useDados.getState();
    const clienteId = s.salvarCliente({
      tipo: 'PF',
      nome: 'Fulano',
      documento: '',
      email: '',
      telefone: '',
      endereco: '',
      observacoes: '',
      criadoEm: '',
    });
    const processoId = s.salvarProcesso({
      numero: '',
      titulo: 'Teste',
      clienteId,
      parteContraria: '',
      tribunal: '',
      orgao: '',
      area: 'Cível',
      etapa: 'consulta',
      status: 'ativo',
      valorCausa: 0,
      observacoes: '',
      criadoEm: '',
    });

    useDados.getState().moverEtapa(processoId, 'inicial');
    useDados.getState().moverEtapa(processoId, 'inicial'); // sem efeito

    const estado = useDados.getState();
    expect(estado.processos[0].etapa).toBe('inicial');
    expect(estado.andamentos).toHaveLength(1);
    expect(estado.andamentos[0]).toMatchObject({ processoId, tipo: 'etapa' });
  });

  it('ao excluir um processo, apaga andamentos e desvincula o resto', () => {
    useDados.getState().carregarExemplo();
    const { processos, compromissos } = useDados.getState();
    const alvo = processos.find((p) => compromissos.some((c) => c.processoId === p.id))!;

    useDados.getState().excluirProcesso(alvo.id);

    const depois = useDados.getState();
    expect(depois.processos.some((p) => p.id === alvo.id)).toBe(false);
    expect(depois.andamentos.some((a) => a.processoId === alvo.id)).toBe(false);
    expect(depois.compromissos.some((c) => c.processoId === alvo.id)).toBe(false);
    expect(depois.compromissos).toHaveLength(compromissos.length);
  });

  it('mantém modelos ao apagar dados e desvincula documentos de processos excluídos', () => {
    const s = useDados.getState();
    s.salvarModelo({ nome: 'Procuração', googleDocId: '1AbCdEfGhIjKlMnOp', descricao: '' });
    s.carregarExemplo();
    const processo = useDados.getState().processos[0];
    useDados.getState().salvarDocumento({
      nome: 'Contrato.pdf',
      driveId: 'arquivo1234',
      url: 'https://drive.google.com/file/d/arquivo1234/view',
      mimeType: 'application/pdf',
      origem: 'drive',
      processoId: processo.id,
      clienteId: processo.clienteId,
      criadoEm: new Date().toISOString(),
    });
    expect(linhaDoTempo(useDados.getState(), processo.id).some((i) => i.tipo === 'documento')).toBe(true);

    useDados.getState().excluirProcesso(processo.id);
    const documento = useDados.getState().documentos[0];
    expect(documento.processoId).toBeUndefined();
    expect(documento.clienteId).toBe(processo.clienteId);

    useDados.getState().apagarTudo();
    expect(useDados.getState().modelos).toHaveLength(1);
    expect(useDados.getState().documentos).toHaveLength(0);
  });

  it('migra dados salvos pela versão anterior, sem documentos nem integração', async () => {
    const v1 = { clientes: [], atendimentos: [], processos: [], andamentos: [], compromissos: [], lancamentos: [], iniciado: true };
    await AsyncStorage.setItem('causa-dados', JSON.stringify({ state: v1, version: 1 }));
    await useDados.persist.rehydrate();
    const estado = useDados.getState();
    expect(estado.documentos).toEqual([]);
    expect(estado.modelos).toEqual([]);
    expect(estado.integracao.webhookUrl).toBe('');
    expect(estado.perfil.nome).toBe('');
  });

  it('marca lançamentos como pagos com data', () => {
    useDados.getState().carregarExemplo();
    const pendente = useDados.getState().lancamentos.find((l) => !l.pago)!;
    useDados.getState().alternarPago(pendente.id);
    const atualizado = useDados.getState().lancamentos.find((l) => l.id === pendente.id)!;
    expect(atualizado.pago).toBe(true);
    expect(atualizado.pagoEm).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
