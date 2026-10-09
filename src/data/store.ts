import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { andamentoDoMovimento, resumoDoProcesso, type ProcessoDataJud } from '../lib/datajud';
import { formatarData, hojeISO } from '../lib/datas';
import { andamentoDaPublicacao, type Publicacao } from '../lib/djen';
import { normalizarBusca } from '../lib/formatos';
import { sugerirPrazos } from '../lib/prazosPublicacao';
import { guardarTokens, lerTokens, type Tokens } from '../lib/segredos';
import { criarDadosExemplo } from './seed';
import { novoProcessoDoDiario, tipoPessoaPeloNome, type ProcessoDoDiario } from './importacao';
import {
  ETAPAS,
  type Advogado,
  type Andamento,
  type Atendimento,
  type Cliente,
  type Compromisso,
  type Conexao,
  type Dados,
  type Documento,
  type EtapaId,
  type Integracao,
  type Lancamento,
  type ModeloDocumento,
  type Perfil,
  type Processo,
} from './types';

/** UUID v4 aleatório (criptográfico): IDs não são sequenciais nem adivinháveis. */
export function gerarId(): string {
  return randomUUID();
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
  /** Guarda o resumo do DataJud e importa só os movimentos novos. Retorna quantos entraram. */
  importarDataJud(processoId: string, dados: ProcessoDataJud): number;
  /**
   * Importa publicações do Diário (DJEN) como andamentos com o inteiro teor e, se ligado
   * em Ajustes, cria na agenda os prazos ainda abertos. Publicações já importadas são ignoradas.
   */
  importarPublicacoes(processoId: string, publicacoes: Publicacao[], hoje?: string): ResultadoImportacao;
  /** Cria (ou reaproveita) clientes e processos encontrados no Diário e importa as publicações. */
  importarDoDiario(itens: { processo: ProcessoDoDiario; clienteNome: string }[], hoje?: string): ResultadoImportacao & { processosNovos: number; clientesNovos: number };
  excluirAndamento(id: string): void;
  salvarCompromisso(c: Rascunho<Compromisso>): string;
  alternarConcluido(id: string): void;
  excluirCompromisso(id: string): void;
  salvarLancamento(l: Rascunho<Lancamento>): string;
  alternarPago(id: string): void;
  excluirLancamento(id: string): void;
  salvarModelo(m: Rascunho<ModeloDocumento>): string;
  excluirModelo(id: string): void;
  salvarDocumento(d: Rascunho<Documento>): string;
  excluirDocumento(id: string): void;
  salvarIntegracao(i: Integracao): void;
  salvarPerfil(p: Perfil): void;
  salvarAdvogado(a: Rascunho<Advogado>): string;
  excluirAdvogado(id: string): void;
  carregarExemplo(): void;
  apagarTudo(): void;
}

interface Configuracoes {
  iniciado: boolean;
  integracao: Integracao;
  perfil: Perfil;
  /** Outros advogados do escritório (o titular está no perfil). */
  equipe: Advogado[];
}

export interface ResultadoImportacao {
  andamentos: number;
  prazos: number;
}

export type Estado = Dados &
  Configuracoes &
  Acoes & {
    /** Tokens lidos do cofre seguro (não é persistido). */
    segredosCarregados: boolean;
  };

const vazio: Dados = {
  clientes: [],
  atendimentos: [],
  processos: [],
  andamentos: [],
  compromissos: [],
  lancamentos: [],
  modelos: [],
  documentos: [],
};

export const conexaoVazia: Conexao = { webhookUrl: '', token: '', pastaDestinoId: '', pastaImportacaoId: '' };
export const integracaoVazia: Integracao = {
  google: conexaoVazia,
  onedrive: conexaoVazia,
  chaveDataJud: '',
  prazosAutomaticos: true,
};
export const perfilVazio: Perfil = { nome: '', oab: '', email: '', telefone: '', cidade: '' };

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
      segredosCarregados: false,
      integracao: integracaoVazia,
      perfil: perfilVazio,
      equipe: [],

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
          documentos: desvincular(s.documentos, 'clienteId', id),
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
          documentos: desvincular(s.documentos, 'processoId', id),
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
      importarDataJud(processoId, dados) {
        const s = get();
        const existentes = new Set(s.andamentos.map((a) => a.chaveExterna).filter(Boolean));
        const novos = dados.movimentos
          .map(andamentoDoMovimento)
          .filter((a) => !existentes.has(a.chaveExterna))
          .map((a) => ({ ...a, id: gerarId(), processoId }));
        set({
          andamentos: [...s.andamentos, ...novos],
          processos: s.processos.map((p) => (p.id === processoId ? { ...p, datajud: resumoDoProcesso(dados) } : p)),
        });
        return novos.length;
      },
      importarPublicacoes(processoId, publicacoes, hoje = hojeISO()) {
        const s = get();
        const processo = s.processos.find((p) => p.id === processoId);
        if (!processo) return { andamentos: 0, prazos: 0 };
        const existentes = new Set(s.andamentos.map((a) => a.chaveExterna).filter(Boolean));
        const prazosExistentes = new Set(s.compromissos.map((c) => c.chaveExterna).filter(Boolean));

        const andamentos: Andamento[] = [];
        const compromissos: Compromisso[] = [];
        for (const p of publicacoes) {
          const andamento = andamentoDaPublicacao(p);
          if (existentes.has(andamento.chaveExterna)) continue;
          existentes.add(andamento.chaveExterna);
          andamentos.push({ ...andamento, id: gerarId(), processoId });
          if (!s.integracao.prazosAutomaticos) continue;

          for (const prazo of sugerirPrazos(p)) {
            const chave = `${andamento.chaveExterna}:${prazo.titulo}`;
            // Prazos já vencidos ficam só na timeline; os abertos vão para a agenda.
            if (prazo.vencimento < hoje || prazosExistentes.has(chave)) continue;
            prazosExistentes.add(chave);
            compromissos.push({
              id: gerarId(),
              tipo: 'prazo',
              titulo: `${prazo.titulo} (${prazo.dias} ${prazo.diasUteis ? 'dias úteis' : 'dias corridos'})`,
              data: prazo.vencimento,
              hora: '',
              processoId,
              clienteId: processo.clienteId || undefined,
              descricao:
                `${prazo.fundamento}\n` +
                `Disponibilizado no DJEN em ${formatarData(p.dataDisponibilizacao)}, publicado em ${formatarData(prazo.publicacao)}. ` +
                'Prazo calculado automaticamente pelo OpenJus: confira no processo e no calendário do tribunal.',
              prioridade: 'alta',
              concluido: false,
              chaveExterna: chave,
            });
          }
        }
        set({ andamentos: [...s.andamentos, ...andamentos], compromissos: [...s.compromissos, ...compromissos] });
        return { andamentos: andamentos.length, prazos: compromissos.length };
      },
      importarDoDiario(itens, hoje = hojeISO()) {
        const total = { andamentos: 0, prazos: 0, processosNovos: 0, clientesNovos: 0 };
        for (const { processo, clienteNome } of itens) {
          const s = get();
          let existente = s.processos.find((p) => p.numero.replace(/\D/g, '') === processo.numero);
          if (!existente) {
            const nome = clienteNome.trim();
            let cliente = nome ? s.clientes.find((c) => normalizarBusca(c.nome) === normalizarBusca(nome)) : undefined;
            if (nome && !cliente) {
              const id = get().salvarCliente({
                tipo: tipoPessoaPeloNome(nome),
                nome,
                documento: '',
                email: '',
                telefone: '',
                endereco: '',
                observacoes: 'Cadastrado automaticamente a partir do Diário de Justiça (DJEN).',
                criadoEm: new Date().toISOString(),
              });
              cliente = get().clientes.find((c) => c.id === id);
              total.clientesNovos++;
            }
            const id = get().salvarProcesso(novoProcessoDoDiario(processo, cliente?.id ?? '', nome));
            existente = get().processos.find((p) => p.id === id);
            total.processosNovos++;
          }
          if (!existente) continue;
          const r = get().importarPublicacoes(existente.id, processo.publicacoes, hoje);
          total.andamentos += r.andamentos;
          total.prazos += r.prazos;
        }
        return total;
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

      salvarModelo(m) {
        const [modelos, id] = salvarEm(get().modelos, m);
        set({ modelos });
        return id;
      },
      excluirModelo(id) {
        set({ modelos: get().modelos.filter((m) => m.id !== id) });
      },

      salvarDocumento(d) {
        const [documentos, id] = salvarEm(get().documentos, d);
        set({ documentos });
        return id;
      },
      excluirDocumento(id) {
        set({ documentos: get().documentos.filter((d) => d.id !== id) });
      },

      salvarIntegracao(integracao) {
        set({ integracao });
        void guardarTokens({ google: integracao.google.token, onedrive: integracao.onedrive.token });
      },
      salvarPerfil(perfil) {
        set({ perfil });
      },
      salvarAdvogado(a) {
        const [equipe, id] = salvarEm(get().equipe, a);
        set({ equipe });
        return id;
      },
      excluirAdvogado(id) {
        set({ equipe: get().equipe.filter((a) => a.id !== id) });
      },

      // Modelos, integração e perfil são configurações e sobrevivem à troca de dados.
      carregarExemplo() {
        set({ ...criarDadosExemplo(hojeISO(), gerarId), modelos: get().modelos, iniciado: true });
      },
      apagarTudo() {
        set({ ...vazio, modelos: get().modelos, iniciado: true });
      },
    }),
    {
      name: 'openjus-dados',
      version: 4,
      storage: createJSONStorage(() => AsyncStorage),
      migrate: (salvo, versao) => migrarDados(salvo as Record<string, unknown>, versao) as unknown as Estado,
      partialize: (s): Dados & Configuracoes => ({
        clientes: s.clientes,
        atendimentos: s.atendimentos,
        processos: s.processos,
        andamentos: s.andamentos,
        compromissos: s.compromissos,
        lancamentos: s.lancamentos,
        modelos: s.modelos,
        documentos: s.documentos,
        // Tokens nunca vão para o AsyncStorage/localStorage: ficam em lib/segredos.
        integracao: semTokens(s.integracao),
        perfil: s.perfil,
        equipe: s.equipe,
        iniciado: s.iniciado,
      }),
      onRehydrateStorage: () => (estado) => {
        // Primeira abertura: mostra dados de exemplo para o app não começar vazio.
        if (estado && !estado.iniciado) estado.carregarExemplo();
        void carregarSegredos(estado?.integracao);
      },
    },
  ),
);

function semTokens(i: Integracao): Integracao {
  return { ...i, google: { ...i.google, token: '' }, onedrive: { ...i.onedrive, token: '' } };
}

/**
 * Coloca os tokens do cofre seguro no estado. Versões antigas guardavam o token
 * junto com os dados: ele é movido para o cofre e apagado do armazenamento comum.
 */
async function carregarSegredos(salva: Integracao | undefined) {
  const legado: Tokens = { google: salva?.google.token ?? '', onedrive: salva?.onedrive.token ?? '' };
  let tokens: Tokens;
  try {
    if (legado.google || legado.onedrive) {
      await guardarTokens(legado);
      tokens = legado;
    } else {
      tokens = await lerTokens();
    }
  } catch {
    tokens = { google: '', onedrive: '' };
  }
  // Este set também regrava o armazenamento comum, já sem os tokens.
  useDados.setState((s) => ({
    segredosCarregados: true,
    integracao: {
      ...s.integracao,
      google: { ...s.integracao.google, token: tokens.google },
      onedrive: { ...s.integracao.onedrive, token: tokens.onedrive },
    },
  }));
}

/**
 * Atualiza dados salvos por versões anteriores do app.
 * v1 → v2: documentos, modelos, integração e perfil.
 * v2 → v3: integração separada por provedor (Google e OneDrive) e chave do DataJud.
 * v3 → v4: prazos automáticos do Diário (DJEN) e equipe do escritório.
 */
export function migrarDados(salvo: Record<string, unknown>, versao: number): Record<string, unknown> {
  let dados = { ...salvo };
  if (versao < 2) {
    dados = {
      modelos: [],
      documentos: [],
      integracao: { webhookUrl: '', token: '', pastaDestinoId: '', pastaImportacaoId: '' },
      perfil: perfilVazio,
      ...dados,
    };
  }
  if (versao < 3) {
    const google = { ...conexaoVazia, ...(dados.integracao as Partial<Conexao>) };
    dados.integracao = { google, onedrive: conexaoVazia, chaveDataJud: '' };
    dados.modelos = ((dados.modelos ?? []) as { googleDocId?: string }[]).map(({ googleDocId, ...m }) => ({
      ...m,
      provedor: 'google',
      arquivoId: googleDocId ?? '',
    }));
    dados.documentos = ((dados.documentos ?? []) as object[]).map((d) => ({ provedor: 'google', ...d }));
  }
  if (versao < 4) {
    dados.integracao = { prazosAutomaticos: true, ...(dados.integracao as object) };
    dados.equipe = dados.equipe ?? [];
  }
  return dados;
}

function registrarMudancaDeEtapa(processoId: string, etapa: EtapaId) {
  const nome = ETAPAS.find((e) => e.id === etapa)?.nome ?? etapa;
  useDados.getState().salvarAndamento({
    processoId,
    data: hojeISO(),
    tipo: 'etapa',
    descricao: `Processo movido para a fase "${nome}".`,
  });
}
