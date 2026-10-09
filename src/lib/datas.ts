import { addDays, differenceInCalendarDays, format, isValid, parse, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import type { DataISO } from '../data/types';

export function paraISO(data: Date): DataISO {
  return format(data, 'yyyy-MM-dd');
}

export function hojeISO(): DataISO {
  return paraISO(new Date());
}

/** Dia local de um instante ISO completo (ex.: criadoEm). */
export function diaDoInstante(instante: string): DataISO {
  return paraISO(new Date(instante));
}

export function deISO(data: DataISO): Date {
  return parseISO(data);
}

export function somarDias(data: DataISO, dias: number): DataISO {
  return paraISO(addDays(deISO(data), dias));
}

export function diasAte(data: DataISO, referencia: DataISO = hojeISO()): number {
  return differenceInCalendarDays(deISO(data), deISO(referencia));
}

/** 'YYYY-MM-DD' → 'dd/mm/aaaa'. */
export function formatarData(data: DataISO): string {
  return data ? format(deISO(data), 'dd/MM/yyyy') : '';
}

function maiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function formatarDataExtenso(data: DataISO): string {
  return maiuscula(format(deISO(data), "EEEE, d 'de' MMMM", { locale: ptBR }));
}

export function formatarDataCurta(data: DataISO): string {
  return format(deISO(data), 'd MMM', { locale: ptBR });
}

export function nomeMes(data: DataISO): string {
  return maiuscula(format(deISO(data), "MMMM 'de' yyyy", { locale: ptBR }));
}

/** Máscara progressiva dd/mm/aaaa para campos de texto. */
export function mascararData(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** 'dd/mm/aaaa' → 'YYYY-MM-DD', ou null se a data não existir. */
export function lerDataBR(valor: string): DataISO | null {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(valor)) return null;
  const data = parse(valor, 'dd/MM/yyyy', new Date());
  return isValid(data) ? paraISO(data) : null;
}

export function descreverDistancia(data: DataISO, referencia: DataISO = hojeISO()): string {
  const dias = diasAte(data, referencia);
  if (dias === 0) return 'Hoje';
  if (dias === 1) return 'Amanhã';
  if (dias === -1) return 'Ontem';
  if (dias < 0) return `${-dias} dias atrás`;
  return `Em ${dias} dias`;
}

// ---------------------------------------------------------------------------
// Contagem de prazos processuais
// ---------------------------------------------------------------------------

/** Domingo de Páscoa pelo algoritmo de Meeus/Jones/Butcher. */
export function domingoDePascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

const cacheFeriados = new Map<number, Set<DataISO>>();

/**
 * Feriados nacionais e os dias sem expediente forense comuns a todo o país
 * (Carnaval, Sexta-feira Santa e Corpus Christi). Feriados estaduais e
 * municipais não entram e precisam ser conferidos no tribunal.
 */
export function feriadosDoAno(ano: number): Set<DataISO> {
  const existente = cacheFeriados.get(ano);
  if (existente) return existente;

  const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25'];
  if (ano >= 2024) fixos.push('11-20');
  const feriados = new Set<DataISO>(fixos.map((md) => `${ano}-${md}`));

  const pascoa = domingoDePascoa(ano);
  for (const deslocamento of [-48, -47, -2, 60]) {
    feriados.add(paraISO(addDays(pascoa, deslocamento)));
  }

  cacheFeriados.set(ano, feriados);
  return feriados;
}

export function ehFeriado(data: DataISO): boolean {
  return feriadosDoAno(Number(data.slice(0, 4))).has(data);
}

export function ehDiaUtil(data: DataISO): boolean {
  const diaSemana = deISO(data).getDay();
  return diaSemana !== 0 && diaSemana !== 6 && !ehFeriado(data);
}

/** Suspensão de prazos entre 20 de dezembro e 20 de janeiro (CPC, art. 220). */
export function ehRecessoForense(data: DataISO): boolean {
  const md = data.slice(5);
  return md >= '12-20' || md <= '01-20';
}

export interface OpcoesPrazo {
  /** Conta apenas dias úteis (CPC, art. 219). Padrão: true. */
  diasUteis?: boolean;
  /** Suspende a contagem no recesso de fim de ano. Padrão: true. */
  considerarRecesso?: boolean;
}

/**
 * Calcula o vencimento de um prazo: exclui o dia do início, inclui o do
 * vencimento e, se este cair em dia não útil, prorroga para o próximo útil
 * (CPC, art. 224).
 */
export function calcularVencimento(inicio: DataISO, dias: number, opcoes: OpcoesPrazo = {}): DataISO {
  const { diasUteis = true, considerarRecesso = true } = opcoes;
  const conta = (data: DataISO) =>
    (!considerarRecesso || !ehRecessoForense(data)) && (!diasUteis || ehDiaUtil(data));

  let atual = inicio;
  let contados = 0;
  while (contados < dias) {
    atual = somarDias(atual, 1);
    if (conta(atual)) contados++;
  }
  while (!ehDiaUtil(atual) || (considerarRecesso && ehRecessoForense(atual))) {
    atual = somarDias(atual, 1);
  }
  return atual;
}
