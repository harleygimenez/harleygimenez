import type { Andamento, ResumoDataJud, TipoAndamento } from '../data/types';
import { decomporCnj, somenteDigitos, validarCnj } from './cnj';
import { paraISO } from './datas';

/**
 * Cliente da API Pública do DataJud (CNJ): metadados e movimentações de
 * processos de todos os tribunais, a partir do número CNJ.
 * Documentação: https://datajud-wiki.cnj.jus.br/api-publica/
 */

export const URL_DATAJUD = 'https://api-publica.datajud.cnj.jus.br';

/** Chave pública divulgada pelo CNJ na wiki do DataJud. O CNJ pode trocá-la; ela é configurável em Ajustes. */
export const CHAVE_PUBLICA_DATAJUD = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';

/** UFs na ordem do código "TR" da numeração CNJ para a Justiça Estadual e Eleitoral. */
const UFS = [
  'ac', 'al', 'ap', 'am', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mt', 'ms', 'mg', 'pa',
  'pb', 'pr', 'pe', 'pi', 'rj', 'rn', 'rs', 'ro', 'rr', 'sc', 'se', 'sp', 'to',
];

/** Alias do índice do tribunal no DataJud (ex.: "tjes"), ou null se o segmento não é coberto. */
export function aliasTribunal(numero: string): string | null {
  const p = decomporCnj(numero);
  if (!p) return null;
  const tr = Number(p.tribunal);
  const uf = UFS[tr - 1];
  switch (p.segmento) {
    case '3':
      return 'stj';
    case '4':
      return tr >= 1 && tr <= 6 ? `trf${tr}` : null;
    case '5':
      if (tr === 0) return 'tst';
      return tr >= 1 && tr <= 24 ? `trt${tr}` : null;
    case '6':
      if (tr === 0) return 'tse';
      return uf ? `tre-${uf}` : null;
    case '7':
      return 'stm';
    case '8':
      if (!uf) return null;
      return uf === 'df' ? 'tjdft' : `tj${uf}`;
    case '9':
      return ({ 13: 'tjmmg', 21: 'tjmrs', 26: 'tjmsp' } as Record<number, string>)[tr] ?? null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Formato da resposta (Elasticsearch)
// ---------------------------------------------------------------------------

interface CodigoNome {
  codigo?: number;
  nome?: string;
}

interface MovimentoBruto extends CodigoNome {
  dataHora?: string;
  complementosTabelados?: { codigo?: number; valor?: number; nome?: string; descricao?: string }[];
}

interface ProcessoBruto {
  numeroProcesso?: string;
  tribunal?: string;
  grau?: string;
  classe?: CodigoNome;
  assuntos?: (CodigoNome | CodigoNome[])[];
  orgaoJulgador?: CodigoNome;
  sistema?: CodigoNome;
  dataAjuizamento?: string;
  dataHoraUltimaAtualizacao?: string;
  nivelSigilo?: number;
  movimentos?: MovimentoBruto[];
}

export interface RespostaDataJud {
  hits?: { hits?: { _source?: ProcessoBruto }[] };
}

// ---------------------------------------------------------------------------
// Formato usado pelo app
// ---------------------------------------------------------------------------

export interface MovimentoDataJud {
  /** Identifica o movimento para não importá-lo duas vezes. */
  chave: string;
  codigo: number;
  data: string;
  nome: string;
  descricao: string;
  grau: string;
}

export interface ProcessoDataJud {
  numero: string;
  tribunal: string;
  graus: string[];
  classe: string;
  assuntos: string[];
  orgaoJulgador: string;
  sistema: string;
  dataAjuizamento: string;
  ultimaAtualizacao: string;
  sigiloso: boolean;
  movimentos: MovimentoDataJud[];
}

/** Aceita "2018-03-15T10:00:00.000Z", "2018-03-15" e "20180315100000". */
export function lerDataDataJud(valor: string | undefined): string {
  if (!valor) return '';
  const compacta = valor.match(/^(\d{4})(\d{2})(\d{2})(\d{6})?$/);
  if (compacta) return `${compacta[1]}-${compacta[2]}-${compacta[3]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? '' : paraISO(data);
}

const NOMES_GRAU: Record<string, string> = {
  G1: '1º grau',
  G2: '2º grau',
  JE: 'Juizado Especial',
  TR: 'Turma Recursal',
  SUP: 'Tribunal Superior',
};

export function descreverGrau(grau: string): string {
  return NOMES_GRAU[grau] ?? grau;
}

/**
 * Alguns tribunais enviam ao DataJud trechos em UTF-8 lidos como Latin-1 ("Ã³rgÃ£o" em vez
 * de "órgão"), às vezes misturados com acentos corretos na mesma frase. Desfaz cada
 * sequência trocada; texto correto passa sem mudança.
 */
export function corrigirAcentos(texto: string): string {
  return texto
    .replace(/[\u00e0-\u00ef][\u0080-\u00bf]{2}/g, (seq) => {
      const [a, b, c] = [...seq].map((ch) => ch.charCodeAt(0));
      const codigo = ((a & 0x0f) << 12) | ((b & 0x3f) << 6) | (c & 0x3f);
      return codigo >= 0x800 ? String.fromCharCode(codigo) : seq;
    })
    .replace(/[\u00c2-\u00df][\u0080-\u00bf]/g, (seq) => {
      const [a, b] = [...seq].map((ch) => ch.charCodeAt(0));
      return String.fromCharCode(((a & 0x1f) << 6) | (b & 0x3f));
    });
}

function descreverMovimento(m: MovimentoBruto): string {
  const complementos = (m.complementosTabelados ?? [])
    .map((c) => corrigirAcentos([c.descricao?.replace(/_/g, ' '), c.nome].filter(Boolean).join(': ')))
    .filter(Boolean);
  return complementos.join(' · ');
}

/** Junta os registros de todos os graus de um mesmo processo. */
export function converterResposta(resposta: RespostaDataJud): ProcessoDataJud | null {
  const fontes = (resposta.hits?.hits ?? []).map((h) => h._source).filter((f): f is ProcessoBruto => !!f);
  if (fontes.length === 0) return null;

  // O registro do grau mais recente costuma ser o mais atual.
  const principal = [...fontes].sort((a, b) =>
    (b.dataHoraUltimaAtualizacao ?? '').localeCompare(a.dataHoraUltimaAtualizacao ?? ''),
  )[0];

  const vistos = new Set<string>();
  const movimentos: MovimentoDataJud[] = [];
  for (const fonte of fontes) {
    for (const m of fonte.movimentos ?? []) {
      const data = lerDataDataJud(m.dataHora);
      const chave = `${fonte.grau ?? ''}|${m.codigo ?? ''}|${m.dataHora ?? ''}`;
      if (!data || !m.nome || vistos.has(chave)) continue;
      vistos.add(chave);
      movimentos.push({
        chave,
        codigo: m.codigo ?? 0,
        data,
        nome: corrigirAcentos(m.nome),
        descricao: descreverMovimento(m),
        grau: fonte.grau ?? '',
      });
    }
  }
  movimentos.sort((a, b) => b.data.localeCompare(a.data) || b.chave.localeCompare(a.chave));

  const assuntos = new Set<string>();
  for (const fonte of fontes) {
    for (const a of fonte.assuntos ?? []) {
      for (const item of Array.isArray(a) ? a : [a]) if (item.nome) assuntos.add(corrigirAcentos(item.nome));
    }
  }

  return {
    numero: principal.numeroProcesso ?? '',
    tribunal: principal.tribunal ?? '',
    graus: [...new Set(fontes.map((f) => f.grau).filter((g): g is string => !!g))],
    classe: corrigirAcentos(principal.classe?.nome ?? ''),
    assuntos: [...assuntos],
    orgaoJulgador: corrigirAcentos(principal.orgaoJulgador?.nome ?? ''),
    sistema: principal.sistema?.nome ?? '',
    dataAjuizamento: lerDataDataJud(fontes.map((f) => f.dataAjuizamento).find(Boolean)),
    ultimaAtualizacao: principal.dataHoraUltimaAtualizacao ?? '',
    sigiloso: fontes.some((f) => (f.nivelSigilo ?? 0) > 0),
    movimentos,
  };
}

// ---------------------------------------------------------------------------
// Conversão para os registros do app
// ---------------------------------------------------------------------------

const TIPOS_POR_NOME: [RegExp, TipoAndamento][] = [
  [/senten[çc]a|julgamento|proced[eê]ncia|homologa/i, 'sentenca'],
  [/decis[ãa]o|liminar|tutela|antecipa[çc][ãa]o/i, 'decisao'],
  [/despacho|mero expediente/i, 'despacho'],
  [/peti[çc][ãa]o|contesta[çc][ãa]o|recurso|apela[çc][ãa]o|embargos|manifesta[çc][ãa]o|juntada/i, 'peticao'],
  [/publica[çc][ãa]o|disponibiliza[çc][ãa]o|intima[çc][ãa]o|cita[çc][ãa]o|expedi[çc][ãa]o/i, 'publicacao'],
];

export function tipoDoMovimento(nome: string): TipoAndamento {
  return TIPOS_POR_NOME.find(([padrao]) => padrao.test(nome))?.[1] ?? 'andamento';
}

export function andamentoDoMovimento(m: MovimentoDataJud): Omit<Andamento, 'id' | 'processoId'> {
  const grau = m.grau && m.grau !== 'G1' ? ` [${descreverGrau(m.grau)}]` : '';
  return {
    data: m.data,
    tipo: tipoDoMovimento(m.nome),
    descricao: `${m.nome}${m.descricao ? ` (${m.descricao})` : ''}${grau}`,
    chaveExterna: `datajud:${m.chave}`,
  };
}

export function resumoDoProcesso(p: ProcessoDataJud, agora: Date = new Date()): ResumoDataJud {
  return {
    atualizadoEm: agora.toISOString(),
    classe: p.classe,
    orgaoJulgador: p.orgaoJulgador,
    assuntos: p.assuntos,
    graus: p.graus,
    sigiloso: p.sigiloso,
  };
}

export class ErroDataJud extends Error {}

export async function consultarDataJud(
  numero: string,
  opcoes: { chave?: string; fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<ProcessoDataJud | null> {
  if (!validarCnj(numero)) throw new ErroDataJud('Número CNJ inválido. Confira os 20 dígitos.');
  const alias = aliasTribunal(numero);
  if (!alias) throw new ErroDataJud('Este tribunal não está disponível na API pública do DataJud.');

  const { chave = CHAVE_PUBLICA_DATAJUD, fetch: buscar = globalThis.fetch, timeoutMs = 30_000 } = opcoes;
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), timeoutMs);
  let resposta: Response;
  try {
    resposta = await buscar(`${URL_DATAJUD}/api_publica_${alias}/_search`, {
      method: 'POST',
      headers: { Authorization: `APIKey ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: { match: { numeroProcesso: somenteDigitos(numero) } }, size: 10 }),
      signal: controle.signal,
    });
  } catch (erro) {
    if (controle.signal.aborted) throw new ErroDataJud('O DataJud demorou demais para responder. Tente de novo.');
    throw new ErroDataJud(`Não foi possível acessar o DataJud (${(erro as Error).message}).`);
  } finally {
    clearTimeout(limite);
  }

  if (resposta.status === 401 || resposta.status === 403) {
    throw new ErroDataJud('O DataJud recusou a chave de acesso. O CNJ pode tê-la trocado: atualize em Ajustes › Integrações.');
  }
  if (!resposta.ok) throw new ErroDataJud(`O DataJud respondeu com erro ${resposta.status}. Tente mais tarde.`);

  let json: RespostaDataJud;
  try {
    json = (await resposta.json()) as RespostaDataJud;
  } catch {
    throw new ErroDataJud('Resposta inesperada do DataJud.');
  }
  return converterResposta(json);
}
