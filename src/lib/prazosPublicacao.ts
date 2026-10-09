import type { DataISO } from '../data/types';
import { calcularVencimento, ehDiaUtil, somarDias } from './datas';
import type { Publicacao } from './djen';

/**
 * Sugere os prazos abertos por uma publicação no Diário de Justiça Eletrônico Nacional:
 * 1. o prazo fixado no próprio texto ("no prazo de 15 (quinze) dias");
 * 2. sem prazo no texto, o prazo da lei para o tipo de ato (CPC, CLT, Lei 9.099, CPP).
 *
 * Contagem (Lei 11.419/2006, art. 4º, §§ 3º e 4º; CPC, arts. 219, 220 e 224):
 * considera-se publicado no primeiro dia útil após a disponibilização, e o prazo
 * começa no primeiro dia útil após a publicação. Feriados locais não são conhecidos.
 */

export interface PrazoSugerido {
  titulo: string;
  dias: number;
  diasUteis: boolean;
  /** Fundamento exibido ao usuário (trecho do texto ou artigo de lei). */
  fundamento: string;
  origem: 'texto' | 'lei';
  publicacao: DataISO;
  vencimento: DataISO;
}

const UNIDADES: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
  dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16,
  dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50,
  sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100, cento: 100,
};

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** "15", "quinze", "quarenta e cinco" → número; null se não for um número. */
export function lerNumero(valor: string): number | null {
  const v = semAcento(valor.trim());
  if (/^\d{1,3}$/.test(v)) return Number(v);
  const partes = v.split(/\s+e\s+/);
  let total = 0;
  for (const parte of partes) {
    const n = UNIDADES[parte.trim()];
    if (n === undefined) return null;
    total += n;
  }
  return total > 0 ? total : null;
}

/** Data em que a publicação se considera feita: primeiro dia útil após a disponibilização. */
export function dataDaPublicacao(disponibilizacao: DataISO): DataISO {
  let data = somarDias(disponibilizacao, 1);
  while (!ehDiaUtil(data)) data = somarDias(data, 1);
  return data;
}

/** Atos reconhecidos no trecho em que o prazo aparece, na ordem de prioridade. */
const ATOS: [RegExp, string][] = [
  // Réplica antes de contestação: "réplica à contestação", "manifestar-se sobre a contestação".
  [/replica|(impugna|manifest|falar|dizer)[\w-]*\s+(\S+\s+){0,5}contestacao/, 'Réplica'],
  [/contesta(r|cao)|apresentar defesa|oferecer defesa/, 'Contestação'],
  [/contrarraz|contra-raz/, 'Contrarrazões'],
  [/embargos de declara/, 'Embargos de declaração'],
  [/emend(a|ar)/, 'Emenda à inicial'],
  [/especifica(r|cao|rem).{0,20}provas|provas que pretende/, 'Especificação de provas'],
  [/alegacoes finais|memoriais/, 'Alegações finais'],
  [/quesitos|assistente tecnico/, 'Quesitos e assistente técnico'],
  [/pagamento|pagar|depositar|deposito/, 'Pagamento'],
  [/custas|preparo|recolh/, 'Recolhimento de custas'],
  [/junt(ar|ada)|apresent(ar|e) (o|os|a|as) documento/, 'Juntada de documentos'],
  [/impugna/, 'Impugnação'],
  [/cumpri|providenci|regulariz|diligenci/, 'Cumprimento de determinação'],
  [/manifest|dizer|fal(ar|e)/, 'Manifestação'],
];

function atoDoTrecho(trecho: string): string {
  const t = semAcento(trecho);
  return ATOS.find(([padrao]) => padrao.test(t))?.[1] ?? 'Prazo';
}

const NUMERO = String.raw`\d{1,3}|[a-zçãéê]+(?:\s+e\s+[a-zçãéê]+)?`;
const PRAZO_NO_TEXTO = new RegExp(
  String.raw`(?:prazo\s+(?:comum\s+|sucessivo\s+|legal\s+)?de|em|no\s+prazo\s+de|dentro\s+de)\s+(${NUMERO})\s*(?:\(\s*(${NUMERO})\s*\)\s*)?dias?(\s+(?:[uú]teis|corridos))?`,
  'gi',
);

/** Frase em volta de uma posição do texto (para achar o ato e mostrar o fundamento). */
function fraseEm(texto: string, inicio: number, fim: number): string {
  const antes = texto.lastIndexOf('.', inicio);
  const quebra = texto.lastIndexOf('\n', inicio);
  const comeco = Math.max(antes, quebra) + 1;
  const depois = texto.slice(fim).search(/[.\n]/);
  const final = depois === -1 ? texto.length : fim + depois + 1;
  return texto.slice(comeco, final).replace(/\s+/g, ' ').trim();
}

export function prazosNoTexto(texto: string): { ato: string; dias: number; corridos: boolean; trecho: string }[] {
  const achados: { ato: string; dias: number; corridos: boolean; trecho: string }[] = [];
  for (const m of texto.matchAll(PRAZO_NO_TEXTO)) {
    const dias = lerNumero(m[1]) ?? (m[2] ? lerNumero(m[2]) : null);
    if (!dias || dias > 365) continue;
    const inicio = m.index ?? 0;
    const trecho = fraseEm(texto, inicio, inicio + m[0].length);
    const ato = atoDoTrecho(trecho);
    if (achados.some((a) => a.ato === ato && a.dias === dias)) continue;
    achados.push({ ato, dias, corridos: /corridos/i.test(m[3] ?? ''), trecho: trecho.slice(0, 300) });
  }
  return achados;
}

type Rito = 'criminal' | 'trabalho' | 'juizado' | 'civel';

export function ritoDaPublicacao(p: Pick<Publicacao, 'classe' | 'numeroProcesso' | 'orgao'>): Rito {
  const classe = semAcento(`${p.classe} ${p.orgao}`);
  if (/criminal|penal|inquerito|habeas|acao penal|execucao da pena|termo circunstanciado/.test(classe)) return 'criminal';
  // J = 5 na numeração CNJ: Justiça do Trabalho.
  if (p.numeroProcesso.length === 20 && p.numeroProcesso[13] === '5') return 'trabalho';
  if (/juizado|turma recursal/.test(classe)) return 'juizado';
  return 'civel';
}

type PrazoLegal = { titulo: string; dias: number; fundamento: string };

/** Prazos da lei quando o texto não fixa prazo, conforme o tipo de ato e o rito. */
export function prazosLegais(p: Pick<Publicacao, 'tipoComunicacao' | 'tipoDocumento' | 'classe' | 'numeroProcesso' | 'orgao'>): PrazoLegal[] {
  const ato = semAcento(`${p.tipoDocumento} ${p.tipoComunicacao}`);
  const rito = ritoDaPublicacao(p);

  if (/edital/.test(ato) && !/cita/.test(ato)) return [];
  if (/cita/.test(ato)) {
    if (rito === 'criminal') return [{ titulo: 'Resposta à acusação', dias: 10, fundamento: 'CPP, art. 396' }];
    if (rito === 'civel') {
      return [{ titulo: 'Contestação', dias: 15, fundamento: 'CPC, art. 335 (confira se há audiência de conciliação designada)' }];
    }
    return [];
  }
  if (/senten/.test(ato)) {
    if (rito === 'criminal') {
      return [
        { titulo: 'Apelação', dias: 5, fundamento: 'CPP, art. 593' },
        { titulo: 'Embargos de declaração', dias: 2, fundamento: 'CPP, art. 382' },
      ];
    }
    if (rito === 'trabalho') {
      return [
        { titulo: 'Recurso ordinário', dias: 8, fundamento: 'CLT, art. 895' },
        { titulo: 'Embargos de declaração', dias: 5, fundamento: 'CLT, art. 897-A' },
      ];
    }
    if (rito === 'juizado') {
      return [
        { titulo: 'Recurso inominado', dias: 10, fundamento: 'Lei 9.099/1995, art. 42' },
        { titulo: 'Embargos de declaração', dias: 5, fundamento: 'Lei 9.099/1995, art. 49' },
      ];
    }
    return [
      { titulo: 'Apelação', dias: 15, fundamento: 'CPC, arts. 1.003, § 5º, e 1.009' },
      { titulo: 'Embargos de declaração', dias: 5, fundamento: 'CPC, art. 1.023' },
    ];
  }
  if (/acordao/.test(ato)) {
    if (rito === 'criminal') return [{ titulo: 'Embargos de declaração', dias: 2, fundamento: 'CPP, art. 619' }];
    if (rito === 'trabalho') {
      return [
        { titulo: 'Recurso de revista', dias: 8, fundamento: 'CLT, art. 896' },
        { titulo: 'Embargos de declaração', dias: 5, fundamento: 'CLT, art. 897-A' },
      ];
    }
    return [
      { titulo: 'Embargos de declaração', dias: 5, fundamento: 'CPC, art. 1.023' },
      { titulo: 'Recurso especial/extraordinário', dias: 15, fundamento: 'CPC, arts. 1.003, § 5º, e 1.029' },
    ];
  }
  if (/decis/.test(ato)) {
    if (rito === 'civel') {
      return [
        { titulo: 'Embargos de declaração', dias: 5, fundamento: 'CPC, art. 1.023' },
        { titulo: 'Agravo de instrumento (se cabível)', dias: 15, fundamento: 'CPC, arts. 1.003, § 5º, e 1.015' },
      ];
    }
    return [{ titulo: 'Embargos de declaração', dias: rito === 'criminal' ? 2 : 5, fundamento: rito === 'criminal' ? 'CPP, art. 382' : 'Embargos de declaração' }];
  }
  if (/intima|despacho|ato ordinatorio/.test(ato) && rito !== 'criminal') {
    return [{ titulo: 'Manifestação', dias: 5, fundamento: 'Prazo não fixado: CPC, art. 218, § 3º' }];
  }
  return [];
}

/** Prazos que a publicação abre, com o vencimento já calculado. */
export function sugerirPrazos(p: Publicacao): PrazoSugerido[] {
  const publicacao = dataDaPublicacao(p.dataDisponibilizacao);
  // Processo penal: prazos contínuos (CPP, art. 798). Demais ritos: dias úteis.
  const diasUteisPadrao = ritoDaPublicacao(p) !== 'criminal';

  const doTexto = prazosNoTexto(p.texto).map((a) => ({
    titulo: a.ato,
    dias: a.dias,
    diasUteis: diasUteisPadrao && !a.corridos,
    fundamento: `Fixado na publicação: "${a.trecho}"`,
    origem: 'texto' as const,
  }));
  const base = doTexto.length > 0 ? doTexto : prazosLegais(p).map((l) => ({ ...l, diasUteis: diasUteisPadrao, origem: 'lei' as const }));

  return base.map((b) => ({
    ...b,
    publicacao,
    vencimento: calcularVencimento(publicacao, b.dias, { diasUteis: b.diasUteis }),
  }));
}
