import { CryptoDigestAlgorithm, CryptoEncoding, digestStringAsync, getRandomBytes } from 'expo-crypto';

import { ehLinkSeguro } from './urls';

/**
 * Cliente mínimo do Supabase (Auth + REST) usado para o login com Google ou Microsoft
 * e para o escritório compartilhado. Fala direto com a API HTTP (sem SDK), o que
 * mantém o app leve e deixa cada chamada testável.
 *
 * Segurança:
 * - Login OAuth com PKCE; o app nunca vê a senha do Google/Microsoft.
 * - O token de acesso fica só na memória; o de renovação vai para o cofre seguro
 *   (lib/segredos), nunca para o AsyncStorage ou o localStorage do navegador.
 * - A chave "anon"/"publishable" do Supabase é pública por definição: quem protege
 *   os dados são as políticas RLS (nuvem/supabase/migrations).
 */

export type ProvedorLogin = 'google' | 'azure';

export const PROVEDORES_LOGIN: Record<ProvedorLogin, string> = {
  google: 'Google',
  azure: 'Microsoft',
};

export interface ConfigNuvem {
  url: string;
  chavePublica: string;
}

export interface Sessao {
  tokenAcesso: string;
  tokenRenovacao: string;
  /** Instante (ms) em que o token de acesso expira. */
  expiraEm: number;
  usuario: { id: string; email: string; nome: string; emailVerificado: boolean };
}

export class ErroNuvem extends Error {
  constructor(
    mensagem: string,
    readonly codigo?: string,
  ) {
    super(mensagem);
  }
}

interface Opcoes {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** Configuração embutida no build (EXPO_PUBLIC_*), que o usuário pode trocar em Ajustes. */
export function configPadrao(): ConfigNuvem {
  return {
    url: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    chavePublica: process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '',
  };
}

export function validarConfigNuvem(config: ConfigNuvem): string | null {
  if (!config.url.trim() || !config.chavePublica.trim()) return 'Informe o endereço e a chave pública do Supabase.';
  if (!ehLinkSeguro(config.url) || !/^https:\/\/[a-z0-9.-]+(:\d+)?\/?$/i.test(config.url.trim())) {
    return 'O endereço do Supabase deve ser https://, como https://abcd.supabase.co';
  }
  const chave = config.chavePublica.trim();
  // Chave publishable (sb_publishable_…) ou anon (JWT). Chaves secretas nunca vão no app.
  if (/^sb_secret_/.test(chave) || /service_role/.test(decodificarJwt(chave)?.role ?? '')) {
    return 'Essa é a chave secreta (service_role). Use a chave pública (anon ou publishable).';
  }
  if (!/^sb_publishable_[\w-]{10,}$/.test(chave) && !decodificarJwt(chave)) {
    return 'Chave pública inválida. Copie a chave "anon" ou "publishable" do projeto no Supabase.';
  }
  return null;
}

function base64UrlParaTexto(parte: string): string {
  const base64 = parte.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parte.length / 4) * 4, '=');
  return decodeURIComponent(
    Array.from(globalThis.atob(base64), (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
  );
}

/** Lê o conteúdo de um JWT (sem validar a assinatura, que é papel do servidor). */
export function decodificarJwt(token: string): Record<string, string> | null {
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  try {
    const conteudo = JSON.parse(base64UrlParaTexto(partes[1]));
    return conteudo && typeof conteudo === 'object' ? conteudo : null;
  } catch {
    return null;
  }
}

function base64Url(bytes: Uint8Array): string {
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return globalThis.btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Desafio S256 do PKCE: base64url(SHA-256(verificador)). */
export async function desafioPkce(verificador: string): Promise<string> {
  const hash = await digestStringAsync(CryptoDigestAlgorithm.SHA256, verificador, { encoding: CryptoEncoding.BASE64 });
  return hash.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Par verificador/desafio do PKCE (RFC 7636, método S256). */
export async function gerarPkce(): Promise<{ verificador: string; desafio: string }> {
  const verificador = base64Url(getRandomBytes(32));
  return { verificador, desafio: await desafioPkce(verificador) };
}

export function urlDeLogin(config: ConfigNuvem, provedor: ProvedorLogin, redirecionar: string, desafio: string): string {
  const parametros = new URLSearchParams({
    provider: provedor,
    redirect_to: redirecionar,
    code_challenge: desafio,
    code_challenge_method: 's256',
    // Só identidade e e-mail: o acesso ao Drive/OneDrive continua pelo n8n.
    scopes: 'openid email profile',
  });
  return `${config.url.trim().replace(/\/$/, '')}/auth/v1/authorize?${parametros.toString()}`;
}

/** Extrai o código de autorização do endereço de retorno (ou o erro do provedor). */
export function lerRetornoDoLogin(url: string): { codigo: string } | { erro: string } {
  const consulta = url.split('?')[1]?.split('#')[0] ?? '';
  const fragmento = url.split('#')[1] ?? '';
  const parametros = new URLSearchParams(consulta);
  const extras = new URLSearchParams(fragmento);
  const erro = parametros.get('error_description') ?? extras.get('error_description') ?? parametros.get('error');
  if (erro) return { erro: erro.replace(/\+/g, ' ') };
  const codigo = parametros.get('code');
  return codigo ? { codigo } : { erro: 'O login não foi concluído.' };
}

async function chamar<T>(
  config: ConfigNuvem,
  caminho: string,
  init: { metodo?: string; corpo?: unknown; token?: string; cabecalhos?: Record<string, string> },
  opcoes: Opcoes = {},
): Promise<T> {
  const invalida = validarConfigNuvem(config);
  if (invalida) throw new ErroNuvem(invalida);
  const { fetch: buscar = globalThis.fetch, timeoutMs = 30_000 } = opcoes;
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), timeoutMs);
  let resposta: Response;
  try {
    resposta = await buscar(`${config.url.trim().replace(/\/$/, '')}${caminho}`, {
      method: init.metodo ?? 'GET',
      headers: {
        apikey: config.chavePublica.trim(),
        'Content-Type': 'application/json',
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        ...init.cabecalhos,
      },
      body: init.corpo === undefined ? undefined : JSON.stringify(init.corpo),
      signal: controle.signal,
    });
  } catch (erro) {
    if (controle.signal.aborted) throw new ErroNuvem('O servidor demorou demais para responder.');
    throw new ErroNuvem(`Sem conexão com o servidor do escritório (${(erro as Error).message}).`);
  } finally {
    clearTimeout(limite);
  }

  const texto = await resposta.text();
  let json: unknown = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = null;
  }
  if (!resposta.ok) {
    const corpo = (json ?? {}) as { message?: string; msg?: string; error_description?: string; code?: string };
    const codigo = corpo.code;
    if (codigo === '40001') throw new ErroNuvem('conflito', codigo);
    if (resposta.status === 401) throw new ErroNuvem('Sua sessão expirou. Entre de novo.', '401');
    if (resposta.status === 429) throw new ErroNuvem('Muitas tentativas. Aguarde um pouco e tente de novo.', '429');
    const mensagem = corpo.message ?? corpo.msg ?? corpo.error_description;
    // Mensagens das funções do banco são em português e pensadas para o usuário.
    throw new ErroNuvem(
      typeof mensagem === 'string' && mensagem.length < 200 ? mensagem : `O servidor respondeu com erro ${resposta.status}.`,
      codigo,
    );
  }
  return json as T;
}

interface RespostaToken {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: {
    id?: string;
    email?: string;
    email_confirmed_at?: string | null;
    user_metadata?: { full_name?: string; name?: string };
  };
}

function lerSessao(r: RespostaToken, agora = Date.now()): Sessao {
  if (!r.access_token || !r.refresh_token || !r.user?.id) throw new ErroNuvem('Resposta de login inesperada.');
  return {
    tokenAcesso: r.access_token,
    tokenRenovacao: r.refresh_token,
    expiraEm: agora + (r.expires_in ?? 3600) * 1000,
    usuario: {
      id: r.user.id,
      email: r.user.email ?? '',
      nome: r.user.user_metadata?.full_name ?? r.user.user_metadata?.name ?? '',
      emailVerificado: !!r.user.email_confirmed_at,
    },
  };
}

export async function trocarCodigo(config: ConfigNuvem, codigo: string, verificador: string, opcoes?: Opcoes): Promise<Sessao> {
  const r = await chamar<RespostaToken>(
    config,
    '/auth/v1/token?grant_type=pkce',
    { metodo: 'POST', corpo: { auth_code: codigo, code_verifier: verificador } },
    opcoes,
  );
  return lerSessao(r);
}

export async function renovarSessao(config: ConfigNuvem, tokenRenovacao: string, opcoes?: Opcoes): Promise<Sessao> {
  const r = await chamar<RespostaToken>(
    config,
    '/auth/v1/token?grant_type=refresh_token',
    { metodo: 'POST', corpo: { refresh_token: tokenRenovacao } },
    opcoes,
  );
  return lerSessao(r);
}

export async function encerrarSessao(config: ConfigNuvem, sessao: Sessao, opcoes?: Opcoes): Promise<void> {
  try {
    await chamar(config, '/auth/v1/logout', { metodo: 'POST', token: sessao.tokenAcesso }, opcoes);
  } catch {
    // Sair localmente mesmo se o servidor não responder.
  }
}

/** Chama uma função do banco (RPC). */
export function rpc<T>(config: ConfigNuvem, sessao: Sessao, funcao: string, parametros: object, opcoes?: Opcoes): Promise<T> {
  if (!/^[a-z_]+$/.test(funcao)) throw new ErroNuvem('Função inválida.');
  return chamar<T>(config, `/rest/v1/rpc/${funcao}`, { metodo: 'POST', corpo: parametros, token: sessao.tokenAcesso }, opcoes);
}

/** Consulta uma tabela pela API REST (as políticas RLS decidem o que volta). */
export function consultar<T>(config: ConfigNuvem, sessao: Sessao, tabela: string, filtros: Record<string, string>, opcoes?: Opcoes): Promise<T[]> {
  if (!/^[a-z_]+$/.test(tabela)) throw new ErroNuvem('Tabela inválida.');
  const consulta = new URLSearchParams(filtros).toString();
  return chamar<T[]>(config, `/rest/v1/${tabela}?${consulta}`, { token: sessao.tokenAcesso }, opcoes);
}

export function inserir(config: ConfigNuvem, sessao: Sessao, tabela: string, linha: object, opcoes?: Opcoes & { mesclar?: boolean }): Promise<unknown> {
  if (!/^[a-z_]+$/.test(tabela)) throw new ErroNuvem('Tabela inválida.');
  return chamar(
    config,
    `/rest/v1/${tabela}`,
    {
      metodo: 'POST',
      corpo: linha,
      token: sessao.tokenAcesso,
      cabecalhos: { Prefer: opcoes?.mesclar ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal' },
    },
    opcoes,
  );
}

export function apagar(config: ConfigNuvem, sessao: Sessao, tabela: string, filtros: Record<string, string>, opcoes?: Opcoes): Promise<unknown> {
  if (!/^[a-z_]+$/.test(tabela)) throw new ErroNuvem('Tabela inválida.');
  const consulta = new URLSearchParams(filtros).toString();
  return chamar(config, `/rest/v1/${tabela}?${consulta}`, { metodo: 'DELETE', token: sessao.tokenAcesso }, opcoes);
}
