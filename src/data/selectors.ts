import { diaDoInstante, diasAte, hojeISO } from '../lib/datas';
import { normalizarBusca } from '../lib/formatos';
import {
  TIPOS_ANDAMENTO,
  TIPOS_COMPROMISSO,
  type Andamento,
  type Compromisso,
  type Dados,
  type DataISO,
  type Documento,
  type Lancamento,
  type Processo,
} from './types';

export function ordenarCompromissos(lista: Compromisso[]): Compromisso[] {
  return [...lista].sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
}

export function compromissosPendentes(compromissos: Compromisso[]): Compromisso[] {
  return ordenarCompromissos(compromissos.filter((c) => !c.concluido));
}

export function compromissosAtrasados(compromissos: Compromisso[], hoje: DataISO = hojeISO()): Compromisso[] {
  return compromissosPendentes(compromissos).filter((c) => c.data < hoje);
}

/** Pendentes de hoje até `dias` à frente (inclusive). */
export function compromissosProximos(
  compromissos: Compromisso[],
  dias: number,
  hoje: DataISO = hojeISO(),
): Compromisso[] {
  return compromissosPendentes(compromissos).filter((c) => {
    const distancia = diasAte(c.data, hoje);
    return distancia >= 0 && distancia <= dias;
  });
}

export interface ResumoFinanceiro {
  recebido: number;
  aReceber: number;
  pago: number;
  aPagar: number;
  vencido: number;
  saldo: number;
}

export function resumirLancamentos(lancamentos: Lancamento[], hoje: DataISO = hojeISO()): ResumoFinanceiro {
  const r: ResumoFinanceiro = { recebido: 0, aReceber: 0, pago: 0, aPagar: 0, vencido: 0, saldo: 0 };
  for (const l of lancamentos) {
    if (l.tipo === 'receita') {
      if (l.pago) r.recebido += l.valor;
      else r.aReceber += l.valor;
    } else if (l.pago) {
      r.pago += l.valor;
    } else {
      r.aPagar += l.valor;
    }
    if (!l.pago && l.vencimento < hoje && l.tipo === 'receita') r.vencido += l.valor;
  }
  r.saldo = r.recebido - r.pago;
  return r;
}

/** Lançamentos com vencimento no mês de `referencia` ('YYYY-MM-DD'). */
export function lancamentosDoMes(lancamentos: Lancamento[], referencia: DataISO): Lancamento[] {
  const mes = referencia.slice(0, 7);
  return lancamentos
    .filter((l) => l.vencimento.startsWith(mes))
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}

export function buscarProcessos(dados: Pick<Dados, 'processos' | 'clientes'>, termo: string): Processo[] {
  const t = normalizarBusca(termo.trim());
  if (!t) return dados.processos;
  const digitos = termo.replace(/\D/g, '');
  const nomeCliente = new Map(dados.clientes.map((c) => [c.id, normalizarBusca(c.nome)]));
  return dados.processos.filter(
    (p) =>
      normalizarBusca(`${p.titulo} ${p.parteContraria} ${p.tribunal} ${p.orgao} ${p.area}`).includes(t) ||
      (nomeCliente.get(p.clienteId) ?? '').includes(t) ||
      (digitos.length >= 4 && p.numero.replace(/\D/g, '').includes(digitos)),
  );
}

export type ItemLinhaDoTempo =
  | { tipo: 'andamento'; id: string; data: DataISO; titulo: string; descricao: string; item: Andamento }
  | { tipo: 'compromisso'; id: string; data: DataISO; titulo: string; descricao: string; item: Compromisso }
  | { tipo: 'lancamento'; id: string; data: DataISO; titulo: string; descricao: string; item: Lancamento }
  | { tipo: 'documento'; id: string; data: DataISO; titulo: string; descricao: string; item: Documento };

/**
 * Junta andamentos, compromissos, lançamentos e documentos de um processo em uma única
 * linha do tempo, do mais recente para o mais antigo.
 */
export function linhaDoTempo(dados: Dados, processoId: string): ItemLinhaDoTempo[] {
  const itens: ItemLinhaDoTempo[] = [
    ...dados.andamentos
      .filter((a) => a.processoId === processoId)
      .map((a) => ({
        tipo: 'andamento' as const,
        id: a.id,
        data: a.data,
        titulo: a.chaveExterna?.startsWith('datajud:')
          ? `${TIPOS_ANDAMENTO[a.tipo]} · DataJud`
          : a.chaveExterna?.startsWith('djen:')
            ? `${TIPOS_ANDAMENTO[a.tipo]} · Diário (DJEN)`
            : TIPOS_ANDAMENTO[a.tipo],
        descricao: a.descricao,
        item: a,
      })),
    ...dados.compromissos
      .filter((c) => c.processoId === processoId)
      .map((c) => ({
        tipo: 'compromisso' as const,
        id: c.id,
        data: c.data,
        titulo: `${TIPOS_COMPROMISSO[c.tipo].nome}: ${c.titulo}`,
        descricao: c.descricao,
        item: c,
      })),
    ...dados.lancamentos
      .filter((l) => l.processoId === processoId)
      .map((l) => ({
        tipo: 'lancamento' as const,
        id: l.id,
        data: l.vencimento,
        titulo: l.tipo === 'receita' ? 'Receita' : 'Despesa',
        descricao: l.descricao,
        item: l,
      })),
    ...dados.documentos
      .filter((d) => d.processoId === processoId)
      .map((d) => ({
        tipo: 'documento' as const,
        id: d.id,
        data: diaDoInstante(d.criadoEm),
        titulo: d.origem === 'gerado' ? 'Documento gerado' : 'Documento do Drive',
        descricao: d.nome,
        item: d,
      })),
  ];
  return itens.sort((a, b) => b.data.localeCompare(a.data));
}
