import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { hojeISO } from '../lib/datas';
import { criarDadosExemplo } from './seed';
import {
  ETAPAS,
  type Andamento,
  type Atendimento,
  type Cliente,
  type Compromisso,
  type Dados,
  type EtapaId,
  type Lancamento,
  type Processo,
} from './types';

export function gerarId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Campos de um registro novo; `id` presente indica edição. */
export type Rascunho<T extends { id: string }> = Omit<T, 'id'> & { id?: string };

function salvarEm<T extends { id: string }>(lista: T[], rascunho: Rascunho<T>): [T[], string] {
  if (rascunho.id) {
    const id = rascunho.id;
    return [lista.map((item) => (item.id === id ? ({ ...item, ...rascunho } as T) : item)), id];
  }
  const id = gerarId();
  return [[...lista, { ...rascunho, id } as T], id];
}

interface Acoes {
  salvarCliente(c: Rascunho<Cliente>): string;
  excluirCliente(id: string): void;
  salvarAtendimento(a: Rascunho<Atendimento>): string;
  excluirAtendimento(id: string): void;
  salvarProcesso(p: Rascunho<Processo>): string;
  excluirProcesso(id: string): void;
  moverEtapa(processoId: string, etapa: EtapaId): void;
  salvarAndamento(a: Rascunho<Andamento>): string;
  excluirAndamento(id: string): void;
  salvarCompromisso(c: Rascunho<Compromisso>): string;
  alternarConcluido(id: string): void;
  excluirCompromisso(id: string): void;
  salvarLancamento(l: Rascunho<Lancamento>): string;
  alternarPago(id: string): void;
  excluirLancamento(id: string): void;
  carregarExemplo(): void;
  apagarTudo(): void;
}

export type Estado = Dados & { iniciado: boolean } & Acoes;

const vazio: Dados = {
  clientes: [],
  atendimentos: [],
  processos: [],
  andamentos: [],
  compromissos: [],
  lancamentos: [],
};

/** Remove o vínculo com um processo ou cliente excluído sem apagar o registro. */
function desvincular<T extends { processoId?: string; clienteId?: string }>(
  lista: T[],
  campo: 'processoId' | 'clienteId',
  id: string,
): T[] {
  return lista.map((item) => (item[campo] === id ? { ...item, [campo]: undefined } : item));
}

export const useDados = create<Estado>()(
  persist(
    (set, get) => ({
      ...vazio,
      iniciado: false,

      salvarCliente(c) {
        const [clientes, id] = salvarEm(get().clientes, c);
        set({ clientes });
        return id;
      },
      excluirCliente(id) {
        const s = get();
        set({
          clientes: s.clientes.filter((c) => c.id !== id),
          atendimentos: s.atendimentos.filter((a) => a.clienteId !== id),
          compromissos: desvincular(s.compromissos, 'clienteId', id),
          lancamentos: desvincular(s.lancamentos, 'clienteId', id),
        });
      },

      salvarAtendimento(a) {
        const [atendimentos, id] = salvarEm(get().atendimentos, a);
        set({ atendimentos });
        return id;
      },
      excluirAtendimento(id) {
        set({ atendimentos: get().atendimentos.filter((a) => a.id !== id) });
      },

      salvarProcesso(p) {
        const anterior = p.id ? get().processos.find((x) => x.id === p.id) : undefined;
        const [processos, id] = salvarEm(get().processos, p);
        set({ processos });
        if (anterior && anterior.etapa !== p.etapa) registrarMudancaDeEtapa(id, p.etapa);
        return id;
      },
      excluirProcesso(id) {
        const s = get();
        set({
          processos: s.processos.filter((p) => p.id !== id),
          andamentos: s.andamentos.filter((a) => a.processoId !== id),
          atendimentos: desvincular(s.atendimentos, 'processoId', id),
          compromissos: desvincular(s.compromissos, 'processoId', id),
          lancamentos: desvincular(s.lancamentos, 'processoId', id),
        });
      },
      moverEtapa(processoId, etapa) {
        const processo = get().processos.find((p) => p.id === processoId);
        if (!processo || processo.etapa === etapa) return;
        set({ processos: get().processos.map((p) => (p.id === processoId ? { ...p, etapa } : p)) });
        registrarMudancaDeEtapa(processoId, etapa);
      },

      salvarAndamento(a) {
        const [andamentos, id] = salvarEm(get().andamentos, a);
        set({ andamentos });
        return id;
      },
      excluirAndamento(id) {
        set({ andamentos: get().andamentos.filter((a) => a.id !== id) });
      },

      salvarCompromisso(c) {
        const [compromissos, id] = salvarEm(get().compromissos, c);
        set({ compromissos });
        return id;
      },
      alternarConcluido(id) {
        set({
          compromissos: get().compromissos.map((c) =>
            c.id === id
              ? { ...c, concluido: !c.concluido, concluidoEm: c.concluido ? undefined : new Date().toISOString() }
              : c,
          ),
        });
      },
      excluirCompromisso(id) {
        set({ compromissos: get().compromissos.filter((c) => c.id !== id) });
      },

      salvarLancamento(l) {
        const [lancamentos, id] = salvarEm(get().lancamentos, l);
        set({ lancamentos });
        return id;
      },
      alternarPago(id) {
        set({
          lancamentos: get().lancamentos.map((l) =>
            l.id === id ? { ...l, pago: !l.pago, pagoEm: l.pago ? undefined : hojeISO() } : l,
          ),
        });
      },
      excluirLancamento(id) {
        set({ lancamentos: get().lancamentos.filter((l) => l.id !== id) });
      },

      carregarExemplo() {
        set({ ...criarDadosExemplo(hojeISO(), gerarId), iniciado: true });
      },
      apagarTudo() {
        set({ ...vazio, iniciado: true });
      },
    }),
    {
      name: 'causa-dados',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ clientes, atendimentos, processos, andamentos, compromissos, lancamentos, iniciado }) => ({
        clientes,
        atendimentos,
        processos,
        andamentos,
        compromissos,
        lancamentos,
        iniciado,
      }),
      onRehydrateStorage: () => (estado) => {
        // Primeira abertura: mostra dados de exemplo para o app não começar vazio.
        if (estado && !estado.iniciado) estado.carregarExemplo();
      },
    },
  ),
);

function registrarMudancaDeEtapa(processoId: string, etapa: EtapaId) {
  const nome = ETAPAS.find((e) => e.id === etapa)?.nome ?? etapa;
  useDados.getState().salvarAndamento({
    processoId,
    data: hojeISO(),
    tipo: 'etapa',
    descricao: `Processo movido para a fase "${nome}".`,
  });
}
