import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { lerOab } from '../lib/djen';
import {
  apagar,
  configPadrao,
  consultar,
  encerrarSessao,
  ErroNuvem,
  gerarPkce,
  inserir,
  lerRetornoDoLogin,
  renovarSessao,
  rpc,
  trocarCodigo,
  urlDeLogin,
  validarConfigNuvem,
  type ConfigNuvem,
  type ProvedorLogin,
  type Sessao,
} from '../lib/nuvem';
import { guardarTokenNuvem, lerTokenNuvem } from '../lib/segredos';
import { ehLinkSeguro } from '../lib/urls';
import { dadosIguais, extrairDados, mesclarDados, type DadosSincronizados } from './mesclagemDados';
import { useDados } from './store';
import type { Advogado, Conexao, Integracao } from './types';

export type Papel = 'admin' | 'advogado' | 'assistente';

export const PAPEIS: Record<Papel, string> = {
  admin: 'Administrador',
  advogado: 'Advogado',
  assistente: 'Assistente',
};

export interface EscritorioDoUsuario {
  id: string;
  nome: string;
  papel: Papel;
}

export interface Membro {
  usuario_id: string;
  papel: Papel;
  nome: string;
  email: string;
  oab: string;
  uf_oab: string;
}

export interface Convite {
  id: string;
  email: string;
  papel: Papel;
  expira_em: string;
}

/** Como juntar os dados do aparelho com os do escritório na primeira sincronização. */
export type ModoEntrada = 'juntar' | 'usar-do-escritorio';

interface EstadoNuvem {
  config: ConfigNuvem;
  escritorio: EscritorioDoUsuario | null;
  /** Versão e cópia dos dados na última sincronização (base da mescla). -1 = nunca sincronizou. */
  versaoBase: number;
  base: DadosSincronizados | null;
  ultimaSincronizacao: string;
  /** Não persistido. */
  sessao: Sessao | null;
  iniciada: boolean;
  sincronizando: boolean;
  erro: string;

  salvarConfig(config: ConfigNuvem): void;
  iniciar(): Promise<void>;
  entrar(provedor: ProvedorLogin): Promise<void>;
  sair(): Promise<void>;
  listarEscritorios(): Promise<EscritorioDoUsuario[]>;
  criarEscritorio(nome: string): Promise<EscritorioDoUsuario>;
  escolherEscritorio(e: EscritorioDoUsuario, modo: ModoEntrada): Promise<void>;
  deixarEscritorio(): void;
  sincronizar(): Promise<void>;
  listarMembros(): Promise<Membro[]>;
  listarConvites(): Promise<Convite[]>;
  convidar(email: string, papel: Papel): Promise<void>;
  cancelarConvite(id: string): Promise<void>;
  removerMembro(usuarioId: string): Promise<void>;
  definirPapel(usuarioId: string, papel: Papel): Promise<void>;
  compartilharIntegracoes(): Promise<void>;
}

function perfilParaServidor() {
  const { perfil } = useDados.getState();
  const oab = lerOab(perfil.oab);
  return { p_nome: perfil.nome, p_oab: oab?.numero ?? '', p_uf_oab: oab?.uf ?? '' };
}

function conexaoSegura(c: Partial<Conexao> | undefined, atual: Conexao): Conexao {
  if (!c || typeof c !== 'object') return atual;
  const texto = (v: unknown, max = 500) => (typeof v === 'string' ? v.slice(0, max) : '');
  const webhookUrl = texto(c.webhookUrl);
  return {
    // Só webhooks https vindos do servidor são aceitos.
    webhookUrl: ehLinkSeguro(webhookUrl) ? webhookUrl : atual.webhookUrl,
    token: texto(c.token) || atual.token,
    pastaDestinoId: texto(c.pastaDestinoId) || atual.pastaDestinoId,
    pastaImportacaoId: texto(c.pastaImportacaoId) || atual.pastaImportacaoId,
  };
}

export const useNuvem = create<EstadoNuvem>()(
  persist(
    (set, get) => {
      async function sessaoValida(): Promise<Sessao> {
        const { sessao, config } = get();
        if (!sessao) throw new ErroNuvem('Entre com a sua conta do Google ou da Microsoft.');
        if (sessao.expiraEm - 60_000 > Date.now()) return sessao;
        try {
          const nova = await renovarSessao(config, sessao.tokenRenovacao);
          await guardarTokenNuvem(nova.tokenRenovacao);
          set({ sessao: nova });
          return nova;
        } catch (e) {
          if ((e as ErroNuvem).codigo === '401' || /refresh|token/i.test((e as Error).message)) {
            set({ sessao: null });
            await guardarTokenNuvem('');
          }
          throw e;
        }
      }

      function escritorioAtual(): EscritorioDoUsuario {
        const e = get().escritorio;
        if (!e) throw new ErroNuvem('Escolha um escritório.');
        return e;
      }

      return {
        config: configPadrao(),
        escritorio: null,
        versaoBase: -1,
        base: null,
        ultimaSincronizacao: '',
        sessao: null,
        iniciada: false,
        sincronizando: false,
        erro: '',

        salvarConfig(config) {
          set({ config: { url: config.url.trim().replace(/\/$/, ''), chavePublica: config.chavePublica.trim() } });
        },

        async iniciar() {
          const { config } = get();
          try {
            const token = await lerTokenNuvem();
            if (!token || validarConfigNuvem(config)) return;
            const sessao = await renovarSessao(config, token);
            await guardarTokenNuvem(sessao.tokenRenovacao);
            set({ sessao });
          } catch {
            // Sem rede ou sessão revogada: o app segue funcionando com os dados do aparelho.
          } finally {
            set({ iniciada: true });
          }
        },

        async entrar(provedor) {
          const { config } = get();
          const invalida = validarConfigNuvem(config);
          if (invalida) throw new ErroNuvem(invalida);
          const { verificador, desafio } = await gerarPkce();
          const retorno = Linking.createURL('auth');
          const resultado = await WebBrowser.openAuthSessionAsync(urlDeLogin(config, provedor, retorno, desafio), retorno);
          if (resultado.type !== 'success') throw new ErroNuvem('Login cancelado.');
          const lido = lerRetornoDoLogin(resultado.url);
          if ('erro' in lido) throw new ErroNuvem(lido.erro);
          const sessao = await trocarCodigo(config, lido.codigo, verificador);
          if (!sessao.usuario.emailVerificado) {
            throw new ErroNuvem('O e-mail desta conta não foi verificado pelo provedor. Use outra conta.');
          }
          await guardarTokenNuvem(sessao.tokenRenovacao);
          set({ sessao, erro: '' });
          const { perfil, salvarPerfil } = useDados.getState();
          if (!perfil.email || !perfil.nome) {
            salvarPerfil({ ...perfil, nome: perfil.nome || sessao.usuario.nome, email: perfil.email || sessao.usuario.email });
          }
          // Entra nos escritórios para os quais este e-mail foi convidado.
          await rpc<number>(config, sessao, 'aceitar_convites', perfilParaServidor()).catch(() => 0);
        },

        async sair() {
          const { sessao, config } = get();
          if (sessao) await encerrarSessao(config, sessao);
          await guardarTokenNuvem('');
          set({ sessao: null, escritorio: null, versaoBase: -1, base: null, ultimaSincronizacao: '', erro: '' });
        },

        async listarEscritorios() {
          const sessao = await sessaoValida();
          const linhas = await consultar<{ papel: Papel; escritorio_id: string; escritorios: { nome: string } | null }>(
            get().config,
            sessao,
            'membros',
            { select: 'papel,escritorio_id,escritorios(nome)', usuario_id: `eq.${sessao.usuario.id}` },
          );
          return linhas.map((l) => ({ id: l.escritorio_id, nome: l.escritorios?.nome ?? 'Escritório', papel: l.papel }));
        },

        async criarEscritorio(nome) {
          const sessao = await sessaoValida();
          const p = perfilParaServidor();
          const id = await rpc<string>(get().config, sessao, 'criar_escritorio', {
            p_nome: nome.trim(),
            p_nome_membro: p.p_nome,
            p_oab: p.p_oab,
            p_uf_oab: p.p_uf_oab,
          });
          return { id, nome: nome.trim(), papel: 'admin' as const };
        },

        async escolherEscritorio(escritorio, modo) {
          set({
            escritorio,
            versaoBase: -1,
            // "juntar": base vazia, então os dados do aparelho são somados aos do escritório.
            // "usar-do-escritorio": base = dados locais, então o que só existe aqui é descartado.
            base: modo === 'juntar' ? extrairDados({}) : extrairDados(useDados.getState()),
          });
          await get().sincronizar();
        },

        deixarEscritorio() {
          set({ escritorio: null, versaoBase: -1, base: null, ultimaSincronizacao: '' });
        },

        async sincronizar() {
          const { escritorio, config } = get();
          if (!escritorio || get().sincronizando) return;
          set({ sincronizando: true, erro: '' });
          try {
            const sessao = await sessaoValida();
            for (let tentativa = 0; tentativa < 3; tentativa++) {
              const [remoto] = await consultar<{ dados: Partial<DadosSincronizados>; versao: number }>(config, sessao, 'dados_escritorio', {
                select: 'dados,versao',
                escritorio_id: `eq.${escritorio.id}`,
              });
              if (!remoto) throw new ErroNuvem('Você não tem mais acesso a este escritório.');
              const local = extrairDados(useDados.getState());
              const base = get().base ?? extrairDados({});
              const mesclado =
                remoto.versao === get().versaoBase ? local : mesclarDados(base, local, extrairDados(remoto.dados ?? {}));

              let versao = remoto.versao;
              if (!dadosIguais(mesclado, remoto.dados ?? {})) {
                try {
                  versao = await rpc<number>(config, sessao, 'salvar_dados', {
                    p_escritorio: escritorio.id,
                    p_dados: mesclado,
                    p_versao_base: remoto.versao,
                  });
                } catch (e) {
                  if ((e as ErroNuvem).codigo === '40001') continue; // alguém gravou antes: mescla de novo
                  throw e;
                }
              }
              // Aplica no aparelho só se algo mudou, para não disparar outra sincronização.
              if (!dadosIguais(mesclado, local)) useDados.setState(mesclado);
              set({ base: mesclado, versaoBase: versao, ultimaSincronizacao: new Date().toISOString() });
              break;
            }
            await atualizarEquipeEIntegracoes(get, sessao);
          } catch (e) {
            set({ erro: (e as Error).message });
            throw e;
          } finally {
            set({ sincronizando: false });
          }
        },

        async listarMembros() {
          const sessao = await sessaoValida();
          return consultar<Membro>(get().config, sessao, 'membros', {
            select: 'usuario_id,papel,nome,email,oab,uf_oab',
            escritorio_id: `eq.${escritorioAtual().id}`,
            order: 'nome.asc',
          });
        },

        async listarConvites() {
          const sessao = await sessaoValida();
          return consultar<Convite>(get().config, sessao, 'convites', {
            select: 'id,email,papel,expira_em',
            escritorio_id: `eq.${escritorioAtual().id}`,
            order: 'criado_em.desc',
          });
        },

        async convidar(email, papel) {
          const sessao = await sessaoValida();
          await inserir(get().config, sessao, 'convites', {
            escritorio_id: escritorioAtual().id,
            email: email.trim().toLowerCase(),
            papel,
            convidado_por: sessao.usuario.id,
          });
        },

        async cancelarConvite(id) {
          const sessao = await sessaoValida();
          await apagar(get().config, sessao, 'convites', { id: `eq.${id}` });
        },

        async removerMembro(usuarioId) {
          const sessao = await sessaoValida();
          await rpc(get().config, sessao, 'remover_membro', { p_escritorio: escritorioAtual().id, p_usuario: usuarioId });
          if (usuarioId === sessao.usuario.id) get().deixarEscritorio();
        },

        async definirPapel(usuarioId, papel) {
          const sessao = await sessaoValida();
          await rpc(get().config, sessao, 'definir_papel', { p_escritorio: escritorioAtual().id, p_usuario: usuarioId, p_papel: papel });
        },

        async compartilharIntegracoes() {
          const sessao = await sessaoValida();
          const { integracao } = useDados.getState();
          await inserir(
            get().config,
            sessao,
            'config_escritorio',
            {
              escritorio_id: escritorioAtual().id,
              integracao: { google: integracao.google, onedrive: integracao.onedrive },
              atualizado_por: sessao.usuario.id,
            },
            { mesclar: true },
          );
        },
      };
    },
    {
      name: 'openjus-nuvem',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      // A sessão (tokens) nunca é persistida aqui: o token de renovação fica no cofre seguro.
      partialize: (s) => ({
        config: s.config,
        escritorio: s.escritorio,
        versaoBase: s.versaoBase,
        base: s.base,
        ultimaSincronizacao: s.ultimaSincronizacao,
      }),
    },
  ),
);

/** Traz a equipe (OABs para o Diário) e as integrações compartilhadas pelo administrador. */
async function atualizarEquipeEIntegracoes(get: () => EstadoNuvem, sessao: Sessao) {
  const { config, escritorio } = get();
  if (!escritorio) return;
  await rpc(config, sessao, 'atualizar_meu_cadastro', { p_escritorio: escritorio.id, ...perfilParaServidor() }).catch(() => undefined);

  const membros = await get().listarMembros();
  const equipe: Advogado[] = membros
    .filter((m) => m.usuario_id !== sessao.usuario.id && m.papel !== 'assistente')
    .map((m) => ({ id: m.usuario_id, nome: m.nome || m.email, oab: m.oab, uf: m.uf_oab, email: m.email }));
  useDados.setState({ equipe });

  const [compartilhada] = await consultar<{ integracao: Partial<Integracao> }>(config, sessao, 'config_escritorio', {
    select: 'integracao',
    escritorio_id: `eq.${escritorio.id}`,
  });
  if (!compartilhada?.integracao || escritorio.papel === 'admin') return;
  const atual = useDados.getState().integracao;
  const nova: Integracao = {
    ...atual,
    google: conexaoSegura(compartilhada.integracao.google, atual.google),
    onedrive: conexaoSegura(compartilhada.integracao.onedrive, atual.onedrive),
  };
  if (JSON.stringify(nova) !== JSON.stringify(atual)) useDados.getState().salvarIntegracao(nova);
}
