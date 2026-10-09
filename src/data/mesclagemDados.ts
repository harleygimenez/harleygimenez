import type { Dados } from './types';

/** Coleções sincronizadas com o escritório (configurações e tokens ficam no aparelho). */
export const COLECOES = [
  'clientes',
  'atendimentos',
  'processos',
  'andamentos',
  'compromissos',
  'lancamentos',
  'modelos',
  'documentos',
] as const satisfies readonly (keyof Dados)[];

type Item = { id: string };

/** JSON com chaves ordenadas, para comparar registros independentemente da ordem dos campos. */
function estavel(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(estavel).join(',')}]`;
  if (valor && typeof valor === 'object') {
    return `{${Object.keys(valor)
      .filter((k) => (valor as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${estavel((valor as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(valor) ?? 'null';
}

const iguais = (a: unknown, b: unknown) => estavel(a) === estavel(b);

function porId<T extends Item>(lista: T[] | undefined): Map<string, T> {
  return new Map((Array.isArray(lista) ? lista : []).filter((i) => i && typeof i.id === 'string').map((i) => [i.id, i]));
}

/**
 * Mescla de três vias, registro a registro: o que só um lado mudou desde a última
 * sincronização (base) prevalece. Se os dois mudaram o mesmo registro, vale a versão
 * deste aparelho; edição vence exclusão, para não perder trabalho.
 */
export function mesclarColecao<T extends Item>(base: T[] | undefined, local: T[] | undefined, remoto: T[] | undefined): T[] {
  const b = porId(base);
  const l = porId(local);
  const r = porId(remoto);
  const ids = [...r.keys(), ...[...l.keys()].filter((id) => !r.has(id))];
  const resultado: T[] = [];
  for (const id of new Set([...ids, ...b.keys()])) {
    const vb = b.get(id);
    const vl = l.get(id);
    const vr = r.get(id);
    const mudouLocal = !iguais(vb, vl);
    const mudouRemoto = !iguais(vb, vr);
    let escolhido: T | undefined;
    if (!mudouLocal) escolhido = vr;
    else if (!mudouRemoto) escolhido = vl;
    else escolhido = vl ?? vr;
    if (escolhido) resultado.push(escolhido);
  }
  return resultado;
}

export type DadosSincronizados = Pick<Dados, (typeof COLECOES)[number]>;

export function extrairDados(d: Partial<Dados>): DadosSincronizados {
  return Object.fromEntries(COLECOES.map((c) => [c, Array.isArray(d[c]) ? d[c] : []])) as unknown as DadosSincronizados;
}

export function mesclarDados(
  base: Partial<DadosSincronizados>,
  local: Partial<DadosSincronizados>,
  remoto: Partial<DadosSincronizados>,
): DadosSincronizados {
  return Object.fromEntries(
    COLECOES.map((c) => [c, mesclarColecao(base[c] as Item[], local[c] as Item[], remoto[c] as Item[])]),
  ) as unknown as DadosSincronizados;
}

export function dadosIguais(a: Partial<DadosSincronizados>, b: Partial<DadosSincronizados>): boolean {
  return iguais(extrairDados(a), extrairDados(b));
}
