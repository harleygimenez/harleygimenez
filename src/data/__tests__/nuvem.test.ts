import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';

import {
  decodificarJwt,
  desafioPkce,
  gerarPkce,
  lerRetornoDoLogin,
  trocarCodigo,
  urlDeLogin,
  validarConfigNuvem,
  type ConfigNuvem,
} from '../../lib/nuvem';
import { dadosIguais, extrairDados, mesclarColecao } from '../mesclagemDados';
import { useNuvem } from '../nuvem';
import { useDados } from '../store';
import type { Cliente } from '../types';

const cofre = (SecureStore as unknown as { __cofre: Map<string, string> }).__cofre;
const esperar = () => new Promise((r) => setTimeout(r, 0));

const base64Url = (texto: string) =>
  globalThis.btoa(unescape(encodeURIComponent(texto))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (conteudo: object) => ['e30', base64Url(JSON.stringify(conteudo)), 'assinatura'].join('.');
const CONFIG: ConfigNuvem = { url: 'https://abcd.supabase.co', chavePublica: 'sb_publishable_AbCdEf123456' };

function cliente(id: string, nome: string): Cliente {
  return { id, tipo: 'PF', nome, documento: '', email: '', telefone: '', endereco: '', observacoes: '', criadoEm: '' };
}

function resposta(corpo: unknown, status = 200): Response {
  return { ok: status < 300, status, text: async () => (corpo === undefined ? '' : JSON.stringify(corpo)) } as Response;
}

describe('configuração e login (PKCE)', () => {
  it('aceita só https e chaves públicas', () => {
    expect(validarConfigNuvem(CONFIG)).toBeNull();
    expect(validarConfigNuvem({ ...CONFIG, chavePublica: jwt({ role: 'anon' }) })).toBeNull();
    expect(validarConfigNuvem({ ...CONFIG, url: 'http://abcd.supabase.co' })).toMatch(/https/);
    expect(validarConfigNuvem({ ...CONFIG, url: 'https://abcd.supabase.co/rest?x=1' })).toMatch(/https/);
    expect(validarConfigNuvem({ ...CONFIG, chavePublica: jwt({ role: 'service_role' }) })).toMatch(/secreta/);
    expect(validarConfigNuvem({ ...CONFIG, chavePublica: 'sb_secret_123456789012' })).toMatch(/secreta/);
    expect(validarConfigNuvem({ ...CONFIG, chavePublica: 'qualquer' })).toMatch(/inválida/);
    expect(decodificarJwt(jwt({ role: 'anon', nome: 'José' }))).toEqual({ role: 'anon', nome: 'José' });
  });

  it('gera o desafio S256 a partir de um verificador aleatório', async () => {
    const a = await gerarPkce();
    const b = await gerarPkce();
    expect(a.verificador).toMatch(/^[\w-]{43}$/);
    expect(a.verificador).not.toBe(b.verificador);
    expect(a.desafio).toBe(await desafioPkce(a.verificador));
    // Conferido com: printf %s <verificador> | openssl dgst -sha256 -binary | base64 (trocando / por _ e sem "=").
    expect(await desafioPkce('dBjftJeZ4CVP-mJ92K9-1JcCAbhLPu9X9jRA1ZfeKOk')).toBe('G5GPlnEIME7OATZtbc5X_ab2rjY_dpD0gooY_bO14Co');
  });

  it('monta o endereço de login e lê o retorno', () => {
    const url = new URL(urlDeLogin(CONFIG, 'azure', 'openjus://auth', 'desafio123'));
    expect(url.origin + url.pathname).toBe('https://abcd.supabase.co/auth/v1/authorize');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      provider: 'azure',
      redirect_to: 'openjus://auth',
      code_challenge: 'desafio123',
      code_challenge_method: 's256',
    });
    expect(lerRetornoDoLogin('openjus://auth?code=abc-123')).toEqual({ codigo: 'abc-123' });
    expect(lerRetornoDoLogin('openjus://auth?error=access_denied&error_description=Usu%C3%A1rio+cancelou')).toEqual({
      erro: 'Usuário cancelou',
    });
    expect(lerRetornoDoLogin('openjus://auth')).toEqual({ erro: 'O login não foi concluído.' });
  });

  it('troca o código pela sessão enviando o verificador', async () => {
    const chamadas: { url: string; init: RequestInit }[] = [];
    const sessao = await trocarCodigo(CONFIG, 'codigo1', 'verificador1', {
      fetch: (async (url: string, init: RequestInit) => {
        chamadas.push({ url, init });
        return resposta({
          access_token: 'acesso',
          refresh_token: 'renovacao',
          expires_in: 3600,
          user: { id: 'u1', email: 'ana@exemplo.com', email_confirmed_at: '2026-01-01', user_metadata: { full_name: 'Ana' } },
        });
      }) as unknown as typeof fetch,
    });
    expect(chamadas[0].url).toBe('https://abcd.supabase.co/auth/v1/token?grant_type=pkce');
    expect(JSON.parse(String(chamadas[0].init.body))).toEqual({ auth_code: 'codigo1', code_verifier: 'verificador1' });
    expect((chamadas[0].init.headers as Record<string, string>).apikey).toBe(CONFIG.chavePublica);
    expect(sessao.usuario).toEqual({ id: 'u1', email: 'ana@exemplo.com', nome: 'Ana', emailVerificado: true });
  });
});

describe('mescla dos dados do escritório', () => {
  const base = [cliente('a', 'Ana'), cliente('b', 'Bruno'), cliente('c', 'Carla')];

  it('junta alterações de aparelhos diferentes', () => {
    const local = [cliente('a', 'Ana Paula'), cliente('b', 'Bruno'), cliente('d', 'Davi')]; // editou a, apagou c, criou d
    const remoto = [cliente('a', 'Ana'), cliente('b', 'Bruno Lima'), cliente('c', 'Carla'), cliente('e', 'Eva')]; // editou b, criou e
    expect(mesclarColecao(base, local, remoto).map((c) => c.nome)).toEqual(['Ana Paula', 'Bruno Lima', 'Eva', 'Davi']);
  });

  it('no conflito vale este aparelho, e edição vence exclusão', () => {
    const local = [cliente('a', 'Ana (aqui)'), cliente('c', 'Carla')];
    const remoto = [cliente('a', 'Ana (lá)'), cliente('b', 'Bruno'), cliente('c', 'Carla Souza')];
    // b: apagado aqui e intacto lá → apagado; c: intacto aqui e editado lá → edição de lá.
    expect(mesclarColecao(base, local, remoto).map((c) => c.nome)).toEqual(['Ana (aqui)', 'Carla Souza']);
    const apagadoLaEditadoAqui = mesclarColecao(base, [cliente('a', 'Ana nova'), ...base.slice(1)], base.slice(1));
    expect(apagadoLaEditadoAqui.map((c) => c.nome)).toEqual(['Bruno', 'Carla', 'Ana nova']);
  });

  it('compara registros sem depender da ordem dos campos', () => {
    const a = { id: 'x', nome: 'A', tipo: 'PF' };
    const b = { tipo: 'PF', nome: 'A', id: 'x', extra: undefined };
    expect(dadosIguais({ clientes: [a as unknown as Cliente] }, { clientes: [b as unknown as Cliente] })).toBe(true);
  });
});

describe('escritório na nuvem', () => {
  /** Servidor falso: Auth do Supabase e a tabela dados_escritorio com controle de versão. */
  function servidor() {
    const estado = { versao: 3, dados: { clientes: [cliente('s1', 'Do escritório')] } as Record<string, unknown>, conflitos: 1 };
    const chamadas: string[] = [];
    const buscar = jest.fn(async (url: string, init: RequestInit = {}) => {
      const caminho = url.replace(CONFIG.url, '');
      chamadas.push(`${init.method ?? 'GET'} ${caminho.split('?')[0]}`);
      if (caminho.startsWith('/auth/v1/token')) {
        return resposta({
          access_token: 'acesso-novo',
          refresh_token: `renovacao-${chamadas.length}`,
          expires_in: 3600,
          user: { id: 'u1', email: 'ana@exemplo.com', email_confirmed_at: '2026-01-01' },
        });
      }
      if (caminho.startsWith('/rest/v1/rpc/aceitar_convites')) return resposta(0);
      if (caminho.startsWith('/rest/v1/rpc/atualizar_meu_cadastro')) return resposta(undefined, 204);
      if (caminho.startsWith('/rest/v1/dados_escritorio')) return resposta([{ dados: estado.dados, versao: estado.versao }]);
      if (caminho.startsWith('/rest/v1/rpc/salvar_dados')) {
        const corpo = JSON.parse(String(init.body));
        if (estado.conflitos > 0) {
          // Outro advogado gravou no meio do caminho.
          estado.conflitos--;
          estado.versao++;
          estado.dados = { ...estado.dados, clientes: [...(estado.dados.clientes as Cliente[]), cliente('s2', 'Do colega')] };
          return resposta({ code: '40001', message: 'conflito' }, 409);
        }
        if (corpo.p_versao_base !== estado.versao) return resposta({ code: '40001', message: 'conflito' }, 409);
        estado.versao++;
        estado.dados = corpo.p_dados;
        return resposta(estado.versao);
      }
      if (caminho.startsWith('/rest/v1/membros')) {
        return resposta([
          { usuario_id: 'u1', papel: 'admin', nome: 'Ana', email: 'ana@exemplo.com', oab: '12345', uf_oab: 'ES' },
          { usuario_id: 'u2', papel: 'advogado', nome: 'Bruno', email: 'bruno@exemplo.com', oab: '54321', uf_oab: 'SP' },
        ]);
      }
      if (caminho.startsWith('/rest/v1/config_escritorio')) return resposta([]);
      return resposta({ message: `rota inesperada ${caminho}` }, 404);
    });
    return { estado, chamadas, buscar };
  }

  it('entra, guarda só o token de renovação no cofre e sincroniza com mescla e nova tentativa', async () => {
    const { estado, buscar } = servidor();
    globalThis.fetch = buscar as unknown as typeof fetch;
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'success', url: 'openjus://auth?code=c1' });

    useDados.setState({ clientes: [cliente('l1', 'Deste aparelho')], equipe: [] });
    useNuvem.setState({ config: CONFIG, sessao: null, escritorio: null, base: null, versaoBase: -1 });

    await useNuvem.getState().entrar('google');
    const [url, retorno] = (WebBrowser.openAuthSessionAsync as jest.Mock).mock.calls[0];
    expect(retorno).toBe('openjus://auth');
    expect(new URL(url).searchParams.get('code_challenge_method')).toBe('s256');
    expect(useNuvem.getState().sessao?.usuario.email).toBe('ana@exemplo.com');

    await useNuvem.getState().escolherEscritorio({ id: 'e1', nome: 'Gimenez Advocacia', papel: 'admin' }, 'juntar');

    // Dados do aparelho + do escritório + do colega que gravou no meio, sem perder nada.
    const nomes = (estado.dados.clientes as Cliente[]).map((c) => c.nome).sort();
    expect(nomes).toEqual(['Deste aparelho', 'Do colega', 'Do escritório']);
    expect(useDados.getState().clientes.map((c) => c.nome).sort()).toEqual(nomes);
    expect(useNuvem.getState().versaoBase).toBe(estado.versao);
    expect(dadosIguais(useNuvem.getState().base ?? {}, extrairDados(useDados.getState()))).toBe(true);

    // A equipe do escritório alimenta a busca no Diário.
    expect(useDados.getState().equipe).toEqual([{ id: 'u2', nome: 'Bruno', oab: '54321', uf: 'SP', email: 'bruno@exemplo.com' }]);

    // Tokens: renovação no cofre; nada de token no armazenamento comum.
    await esperar();
    expect(cofre.get('openjus.nuvem.renovacao')).toMatch(/^renovacao-/);
    const salvo = (await AsyncStorage.getItem('openjus-nuvem')) ?? '';
    expect(salvo).toContain('Gimenez Advocacia');
    expect(salvo).not.toMatch(/acesso-novo|renovacao-/);
  });

  it('sincronização seguinte só envia quando algo mudou', async () => {
    const { buscar, chamadas, estado } = servidor();
    globalThis.fetch = buscar as unknown as typeof fetch;
    useNuvem.setState({
      config: CONFIG,
      escritorio: { id: 'e1', nome: 'Gimenez Advocacia', papel: 'advogado' },
      versaoBase: estado.versao,
      base: extrairDados({ clientes: [cliente('s1', 'Do escritório')] }),
      sessao: { tokenAcesso: 'a', tokenRenovacao: 'r', expiraEm: Date.now() + 3_600_000, usuario: { id: 'u1', email: '', nome: '', emailVerificado: true } },
    });
    useDados.setState(extrairDados({ clientes: [cliente('s1', 'Do escritório')] }));
    await useNuvem.getState().sincronizar();
    expect(chamadas.filter((c) => c.includes('salvar_dados'))).toHaveLength(0);

    useDados.getState().salvarCliente({ ...cliente('', 'Novo'), id: undefined });
    await useNuvem.getState().sincronizar();
    expect(chamadas.filter((c) => c.includes('salvar_dados')).length).toBeGreaterThan(0);
  });

  it('sair apaga a sessão do cofre e esquece o escritório', async () => {
    globalThis.fetch = servidor().buscar as unknown as typeof fetch;
    await useNuvem.getState().sair();
    expect(cofre.has('openjus.nuvem.renovacao')).toBe(false);
    expect(useNuvem.getState()).toMatchObject({ sessao: null, escritorio: null, base: null });
  });
});
