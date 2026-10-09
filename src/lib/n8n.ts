import type { Conexao } from '../data/types';
import { ehLinkSeguro, validarUrlWebhook } from './urls';

/**
 * Cliente dos webhooks do n8n que fazem a ponte com o Google Drive/Docs e com o OneDrive
 * (workflows em integracoes/n8n/). O app nunca guarda credenciais do Google ou da Microsoft:
 * elas ficam no n8n, e o app só envia um token próprio no cabeçalho.
 */

export const CABECALHO_TOKEN = 'X-Causa-Token';

export interface ArquivoDrive {
  id: string;
  nome: string;
  url: string;
  mimeType: string;
  modificadoEm?: string;
}

export class ErroIntegracao extends Error {}

interface Opcoes {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export function validarIntegracao(config: Pick<Conexao, 'webhookUrl'>): string | null {
  if (!config.webhookUrl.trim()) return 'Informe a URL do webhook do n8n em Ajustes › Integrações.';
  return validarUrlWebhook(config.webhookUrl);
}

async function chamar<T>(config: Conexao, acao: string, dados: object, opcoes: Opcoes = {}): Promise<T> {
  const invalida = validarIntegracao(config);
  if (invalida) throw new ErroIntegracao(invalida);

  const { fetch: buscar = globalThis.fetch, timeoutMs = 30_000 } = opcoes;
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), timeoutMs);

  let resposta: Response;
  try {
    resposta = await buscar(config.webhookUrl.trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.token ? { [CABECALHO_TOKEN]: config.token } : {}),
      },
      body: JSON.stringify({ acao, ...dados }),
      signal: controle.signal,
    });
  } catch (erro) {
    if (controle.signal.aborted) throw new ErroIntegracao('O n8n demorou demais para responder.');
    throw new ErroIntegracao(`Não foi possível conectar ao n8n (${(erro as Error).message}).`);
  } finally {
    clearTimeout(limite);
  }

  const corpo = await resposta.text();
  let json: unknown;
  try {
    json = corpo ? JSON.parse(corpo) : {};
  } catch {
    json = undefined;
  }
  const mensagem = (json as { erro?: unknown } | undefined)?.erro;

  if (!resposta.ok) {
    if (typeof mensagem === 'string') throw new ErroIntegracao(mensagem);
    if (resposta.status === 401 || resposta.status === 403) {
      throw new ErroIntegracao('O n8n recusou o token. Confira o token em Ajustes › Integrações.');
    }
    if (resposta.status === 404) {
      throw new ErroIntegracao('Webhook não encontrado. Confira a URL e se o workflow está ativo no n8n.');
    }
    throw new ErroIntegracao(`O n8n respondeu com erro ${resposta.status}. Veja a execução no n8n para detalhes.`);
  }
  if (json === undefined) throw new ErroIntegracao('O n8n respondeu algo que não é JSON. O workflow está correto?');
  return json as T;
}

export async function testarConexao(config: Conexao, opcoes?: Opcoes): Promise<{ versao: number }> {
  const r = await chamar<{ ok?: boolean; versao?: number }>(config, 'ping', {}, opcoes);
  if (!r.ok) throw new ErroIntegracao('Resposta inesperada do n8n. Importe o workflow do Causa no n8n.');
  return { versao: r.versao ?? 0 };
}

export async function listarArquivos(
  config: Conexao,
  filtro: { busca?: string; pastaId?: string },
  opcoes?: Opcoes,
): Promise<ArquivoDrive[]> {
  const r = await chamar<{ arquivos?: ArquivoDrive[] }>(
    config,
    'listar_arquivos',
    { busca: filtro.busca?.trim() ?? '', pastaId: filtro.pastaId ?? '' },
    opcoes,
  );
  if (!Array.isArray(r.arquivos)) throw new ErroIntegracao('Resposta inesperada do n8n ao listar arquivos.');
  // A resposta vem de fora do app: só passam itens bem formados com link https.
  return r.arquivos
    .filter((a) => a && typeof a.id === 'string' && typeof a.nome === 'string' && ehLinkSeguro(a.url))
    .map((a) => ({
      id: a.id,
      nome: a.nome.slice(0, 300),
      url: a.url,
      mimeType: typeof a.mimeType === 'string' ? a.mimeType : '',
      modificadoEm: typeof a.modificadoEm === 'string' ? a.modificadoEm : undefined,
    }));
}

export async function gerarDocumento(
  config: Conexao,
  pedido: { modeloId: string; nomeArquivo: string; campos: Record<string, string> },
  opcoes?: Opcoes,
): Promise<ArquivoDrive> {
  if (!config.pastaDestinoId) {
    throw new ErroIntegracao('Escolha a pasta para documentos gerados em Ajustes › Integrações.');
  }
  const r = await chamar<{ arquivo?: ArquivoDrive }>(
    config,
    'gerar_documento',
    { ...pedido, pastaId: config.pastaDestinoId },
    opcoes,
  );
  const a = r.arquivo;
  if (!a || typeof a.id !== 'string' || typeof a.nome !== 'string' || !ehLinkSeguro(a.url)) {
    throw new ErroIntegracao('Resposta inesperada do n8n ao gerar o documento.');
  }
  return { id: a.id, nome: a.nome.slice(0, 300), url: a.url, mimeType: typeof a.mimeType === 'string' ? a.mimeType : '' };
}
