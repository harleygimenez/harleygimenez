import type { Andamento, DataISO, TipoAndamento } from '../data/types';
import { mascararCnj, somenteDigitos, validarCnj } from './cnj';
import { lerDataDataJud } from './datajud';
import { ehLinkSeguro } from './urls';

/**
 * Cliente da API pública de comunicações processuais do CNJ (Comunica PJe), que é a
 * base do Diário de Justiça Eletrônico Nacional (DJEN). Diferente do DataJud, que só
 * informa o nome de cada movimentação, aqui vem o texto publicado: o inteiro teor do
 * despacho, da decisão ou da sentença, com as partes e os advogados intimados.
 * A consulta é pública e não exige chave. Portal: https://comunica.pje.jus.br
 */

export const URL_DJEN = 'https://comunicaapi.pje.jus.br/api/v1';

/** Limite de texto guardado por publicação (o restante fica na certidão). */
export const LIMITE_INTEIRO_TEOR = 20_000;

export const UFS_OAB = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
] as const;

// ---------------------------------------------------------------------------
// Texto: a API devolve HTML; o app mostra só texto puro (nunca renderiza HTML).
// ---------------------------------------------------------------------------

const ACENTOS: Record<string, string> = {
  acute: '́',
  grave: '̀',
  circ: '̂',
  tilde: '̃',
  cedil: '̧',
  uml: '̈',
};

const ENTIDADES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  ordm: 'º',
  ordf: 'ª',
  sect: '§',
  deg: '°',
  ndash: '–',
  mdash: '—',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  middot: '·',
  bull: '•',
};

function decodificarEntidades(texto: string): string {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (original, nome: string) => {
    if (nome[0] === '#') {
      const codigo = nome[1] === 'x' || nome[1] === 'X' ? parseInt(nome.slice(2), 16) : parseInt(nome.slice(1), 10);
      // Só caracteres imprimíveis; controles viram espaço.
      return codigo >= 32 && codigo <= 0x10ffff ? String.fromCodePoint(codigo) : ' ';
    }
    const acento = nome.match(/^([a-z])(acute|grave|circ|tilde|cedil|uml)$/i);
    if (acento) return `${acento[1]}${ACENTOS[acento[2].toLowerCase()]}`.normalize('NFC');
    return ENTIDADES[nome.toLowerCase()] ?? original;
  });
}

/** Converte o HTML da publicação em texto com parágrafos. */
export function textoPuro(html: string): string {
  return decodificarEntidades(
    html
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/ /g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Formato da resposta (os nomes variam entre snake_case e camelCase)
// ---------------------------------------------------------------------------

type Bruto = Record<string, unknown>;

export interface RespostaDJEN {
  status?: string;
  message?: string;
  count?: number;
  total?: number;
  items?: Bruto[];
  itens?: Bruto[];
}

export interface Destinatario {
  nome: string;
  /** 'A' (ativo), 'P' (passivo) ou vazio. */
  polo: string;
}

export interface AdvogadoIntimado {
  nome: string;
  oab: string;
  uf: string;
}

export interface Publicacao {
  /** Identifica a comunicação para não importá-la duas vezes. */
  chave: string;
  dataDisponibilizacao: DataISO;
  tribunal: string;
  /** Intimação, Citação, Edital… */
  tipoComunicacao: string;
  /** Despacho, Decisão, Sentença, Acórdão, Ato ordinatório… */
  tipoDocumento: string;
  orgao: string;
  classe: string;
  /** 20 dígitos. */
  numeroProcesso: string;
  texto: string;
  /** Link do documento no tribunal (só https). */
  link: string;
  /** Certidão de publicação em PDF no DJEN (só https). */
  certidao: string;
  destinatarios: Destinatario[];
  advogados: AdvogadoIntimado[];
}

function texto(obj: Bruto | undefined, ...nomes: string[]): string {
  for (const nome of nomes) {
    const valor = obj?.[nome];
    if (typeof valor === 'string' && valor.trim()) return valor.trim();
    if (typeof valor === 'number') return String(valor);
  }
  return '';
}

function lista(obj: Bruto, ...nomes: string[]): Bruto[] {
  for (const nome of nomes) {
    const valor = obj[nome];
    if (Array.isArray(valor)) return valor.filter((v): v is Bruto => !!v && typeof v === 'object');
  }
  return [];
}

/** "2024-05-10", "2024-05-10T00:00:00" ou "10/05/2024". */
function lerData(valor: string): DataISO {
  const br = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = valor.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : lerDataDataJud(valor);
}

const limitar = (valor: string, maximo: number) => valor.slice(0, maximo);

export function converterPublicacao(item: Bruto): Publicacao | null {
  const numeroProcesso = somenteDigitos(
    texto(item, 'numero_processo', 'numeroProcesso', 'numeroprocessocommascara', 'numeroProcessoComMascara'),
  );
  const dataDisponibilizacao = lerData(
    texto(item, 'data_disponibilizacao', 'dataDisponibilizacao', 'datadisponibilizacao'),
  );
  const id = texto(item, 'id');
  const hash = texto(item, 'hash');
  if (numeroProcesso.length !== 20 || !dataDisponibilizacao || !(id || hash)) return null;

  const link = texto(item, 'link');
  const destinatarios = lista(item, 'destinatarios')
    .map((d) => ({ nome: limitar(texto(d, 'nome'), 300), polo: texto(d, 'polo').toUpperCase().slice(0, 1) }))
    .filter((d) => d.nome);
  const advogados = lista(item, 'destinatarioadvogados', 'destinatarioAdvogados', 'advogados')
    .map((d) => {
      const adv = (d.advogado && typeof d.advogado === 'object' ? d.advogado : d) as Bruto;
      return {
        nome: limitar(texto(adv, 'nome'), 300),
        oab: somenteDigitos(texto(adv, 'numero_oab', 'numeroOab')),
        uf: texto(adv, 'uf_oab', 'ufOab').toUpperCase().slice(0, 2),
      };
    })
    .filter((a) => a.nome || a.oab);

  return {
    chave: hash || id,
    dataDisponibilizacao,
    tribunal: limitar(texto(item, 'siglaTribunal', 'sigla_tribunal'), 20),
    tipoComunicacao: limitar(texto(item, 'tipoComunicacao', 'tipo_comunicacao'), 100),
    tipoDocumento: limitar(texto(item, 'tipoDocumento', 'tipo_documento'), 100),
    orgao: limitar(texto(item, 'nomeOrgao', 'nome_orgao'), 300),
    classe: limitar(texto(item, 'nomeClasse', 'nome_classe'), 300),
    numeroProcesso,
    texto: limitar(textoPuro(texto(item, 'texto')), LIMITE_INTEIRO_TEOR),
    link: ehLinkSeguro(link) ? link : '',
    certidao: /^[A-Za-z0-9_-]{8,128}$/.test(hash) ? `${URL_DJEN}/comunicacao/${hash}/certidao` : '',
    destinatarios,
    advogados,
  };
}

/** Lê a resposta da API, ignora itens malformados e remove duplicados. */
export function converterRespostaDJEN(resposta: RespostaDJEN): { total: number; publicacoes: Publicacao[] } {
  const itens = Array.isArray(resposta.items) ? resposta.items : Array.isArray(resposta.itens) ? resposta.itens : [];
  const vistas = new Set<string>();
  const publicacoes: Publicacao[] = [];
  for (const item of itens) {
    const p = item && typeof item === 'object' ? converterPublicacao(item) : null;
    if (!p || vistas.has(p.chave)) continue;
    vistas.add(p.chave);
    publicacoes.push(p);
  }
  const total = Number(resposta.count ?? resposta.total ?? itens.length);
  return { total: Number.isFinite(total) ? total : itens.length, publicacoes };
}

// ---------------------------------------------------------------------------
// Conversão para os registros do app
// ---------------------------------------------------------------------------

export function tipoDaPublicacao(p: Pick<Publicacao, 'tipoDocumento' | 'tipoComunicacao'>): TipoAndamento {
  const nome = `${p.tipoDocumento} ${p.tipoComunicacao}`;
  if (/senten[çc]a/i.test(nome)) return 'sentenca';
  if (/ac[óo]rd[ãa]o|decis[ãa]o/i.test(nome)) return 'decisao';
  if (/despacho/i.test(nome)) return 'despacho';
  return 'publicacao';
}

export function descreverPublicacao(p: Publicacao): string {
  const ato = [p.tipoComunicacao, p.tipoDocumento].filter(Boolean).join(' · ') || 'Publicação';
  const onde = [p.orgao, p.tribunal].filter(Boolean).join(' · ');
  return onde ? `${ato} — ${onde}` : ato;
}

export function andamentoDaPublicacao(p: Publicacao): Omit<Andamento, 'id' | 'processoId'> {
  return {
    data: p.dataDisponibilizacao,
    tipo: tipoDaPublicacao(p),
    descricao: descreverPublicacao(p),
    chaveExterna: `djen:${p.chave}`,
    inteiroTeor: p.texto,
    link: p.certidao || p.link || undefined,
  };
}

// ---------------------------------------------------------------------------
// Consulta
// ---------------------------------------------------------------------------

export class ErroDJEN extends Error {}

export interface FiltroDJEN {
  numeroProcesso?: string;
  numeroOab?: string;
  ufOab?: string;
  /** 'YYYY-MM-DD'. */
  dataInicio?: DataISO;
  dataFim?: DataISO;
}

interface OpcoesDJEN {
  fetch?: typeof fetch;
  timeoutMs?: number;
  itensPorPagina?: number;
  maxPaginas?: number;
}

/** "OAB/ES 12.345", "12345/ES", "ES12345" → { numero: '12345', uf: 'ES' }. */
export function lerOab(valor: string): { numero: string; uf: string } | null {
  const maiusculo = valor.toUpperCase();
  const uf = UFS_OAB.find((u) => new RegExp(`(^|[^A-Z])${u}([^A-Z]|$)`).test(maiusculo.replace(/OAB/g, ' ')));
  const numero = (maiusculo.match(/\d[\d.]*/)?.[0] ?? '').replace(/\./g, '');
  if (!uf || !/^\d{1,7}$/.test(numero)) return null;
  return { numero: numero.replace(/^0+(?=\d)/, ''), uf };
}

export function montarConsultaDJEN(filtro: FiltroDJEN, pagina: number, itensPorPagina: number): string {
  const parametros = new URLSearchParams();
  if (filtro.numeroProcesso) {
    if (!validarCnj(filtro.numeroProcesso)) throw new ErroDJEN('Número CNJ inválido. Confira os 20 dígitos.');
    parametros.set('numeroProcesso', somenteDigitos(filtro.numeroProcesso));
  }
  if (filtro.numeroOab || filtro.ufOab) {
    const bruto = (filtro.numeroOab ?? '').trim();
    const numero = somenteDigitos(bruto);
    const uf = (filtro.ufOab ?? '').trim().toUpperCase();
    if (!/^[\d.\s-]+$/.test(bruto) || !/^\d{1,7}$/.test(numero) || !(UFS_OAB as readonly string[]).includes(uf)) {
      throw new ErroDJEN('Informe o número e a UF da OAB, como 12345/ES.');
    }
    parametros.set('numeroOab', numero);
    parametros.set('ufOab', uf);
  }
  if (!parametros.has('numeroProcesso') && !parametros.has('numeroOab')) {
    throw new ErroDJEN('Informe o número do processo ou a OAB para consultar o Diário.');
  }
  for (const [nome, data] of [
    ['dataDisponibilizacaoInicio', filtro.dataInicio],
    ['dataDisponibilizacaoFim', filtro.dataFim],
  ] as const) {
    if (!data) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new ErroDJEN('Data inválida na consulta ao Diário.');
    parametros.set(nome, data);
  }
  parametros.set('pagina', String(pagina));
  parametros.set('itensPorPagina', String(itensPorPagina));
  return `${URL_DJEN}/comunicacao?${parametros.toString()}`;
}

/**
 * Consulta as publicações do DJEN pelo número do processo ou pela OAB, percorrendo
 * as páginas. A API limita as consultas por IP: em caso de excesso, avisa para aguardar.
 */
export async function consultarPublicacoes(filtro: FiltroDJEN, opcoes: OpcoesDJEN = {}): Promise<Publicacao[]> {
  const { fetch: buscar = globalThis.fetch, timeoutMs = 30_000, itensPorPagina = 100, maxPaginas = 10 } = opcoes;
  montarConsultaDJEN(filtro, 1, itensPorPagina); // valida antes de qualquer acesso à rede

  const todas: Publicacao[] = [];
  const vistas = new Set<string>();
  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const controle = new AbortController();
    const limite = setTimeout(() => controle.abort(), timeoutMs);
    let resposta: Response;
    try {
      resposta = await buscar(montarConsultaDJEN(filtro, pagina, itensPorPagina), {
        headers: { Accept: 'application/json' },
        signal: controle.signal,
      });
    } catch (erro) {
      if (controle.signal.aborted) throw new ErroDJEN('O Diário (DJEN) demorou demais para responder. Tente de novo.');
      throw new ErroDJEN(`Não foi possível acessar o Diário (DJEN) (${(erro as Error).message}).`);
    } finally {
      clearTimeout(limite);
    }

    if (resposta.status === 429) {
      throw new ErroDJEN('O DJEN limita o número de consultas. Aguarde um minuto e tente de novo.');
    }
    if (resposta.status === 401 || resposta.status === 403) {
      throw new ErroDJEN('O DJEN recusou a consulta. Ele pode bloquear acessos de fora do Brasil ou de servidores; tente pelo celular.');
    }
    if (resposta.status === 404) break;
    if (!resposta.ok) throw new ErroDJEN(`O DJEN respondeu com erro ${resposta.status}. Tente mais tarde.`);

    let json: RespostaDJEN;
    try {
      json = (await resposta.json()) as RespostaDJEN;
    } catch {
      throw new ErroDJEN('Resposta inesperada do DJEN.');
    }
    const { total, publicacoes } = converterRespostaDJEN(json ?? {});
    const quantidade = (Array.isArray(json?.items) ? json.items : Array.isArray(json?.itens) ? json.itens : []).length;
    for (const p of publicacoes) {
      if (vistas.has(p.chave)) continue;
      vistas.add(p.chave);
      todas.push(p);
    }
    if (quantidade < itensPorPagina || pagina * itensPorPagina >= total) break;
  }
  return todas.sort((a, b) => b.dataDisponibilizacao.localeCompare(a.dataDisponibilizacao));
}

export function formatarNumeroProcesso(digitos: string): string {
  return mascararCnj(digitos);
}
