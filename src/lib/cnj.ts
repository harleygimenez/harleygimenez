/**
 * Numeração única de processos do CNJ (Resolução CNJ 65/2008):
 * NNNNNNN-DD.AAAA.J.TR.OOOO, em que DD é o dígito verificador calculado
 * por módulo 97 (ISO 7064) sobre NNNNNNN AAAA J TR OOOO 00.
 */

const SEGMENTOS_JUSTICA: Record<string, string> = {
  '1': 'STF',
  '2': 'CNJ',
  '3': 'STJ',
  '4': 'Justiça Federal',
  '5': 'Justiça do Trabalho',
  '6': 'Justiça Eleitoral',
  '7': 'Justiça Militar da União',
  '8': 'Justiça Estadual',
  '9': 'Justiça Militar Estadual',
};

export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

/** Resto de um número decimal arbitrariamente longo por 97. */
function mod97(digitos: string): number {
  let resto = 0;
  for (const c of digitos) {
    resto = (resto * 10 + Number(c)) % 97;
  }
  return resto;
}

export function calcularDigitoCnj(
  sequencial: string,
  ano: string,
  segmento: string,
  tribunal: string,
  origem: string,
): string {
  const base = `${sequencial}${ano}${segmento}${tribunal}${origem}00`;
  return String(98 - mod97(base)).padStart(2, '0');
}

/** Aplica a máscara progressivamente, útil enquanto o usuário digita. */
export function mascararCnj(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 20);
  const partes: [number, number, string][] = [
    [0, 7, ''],
    [7, 9, '-'],
    [9, 13, '.'],
    [13, 14, '.'],
    [14, 16, '.'],
    [16, 20, '.'],
  ];
  let saida = '';
  for (const [inicio, fim, separador] of partes) {
    if (d.length <= inicio) break;
    saida += separador + d.slice(inicio, fim);
  }
  return saida;
}

export interface CnjDecomposto {
  sequencial: string;
  digito: string;
  ano: string;
  segmento: string;
  tribunal: string;
  origem: string;
}

export function decomporCnj(valor: string): CnjDecomposto | null {
  const d = somenteDigitos(valor);
  if (d.length !== 20) return null;
  return {
    sequencial: d.slice(0, 7),
    digito: d.slice(7, 9),
    ano: d.slice(9, 13),
    segmento: d.slice(13, 14),
    tribunal: d.slice(14, 16),
    origem: d.slice(16, 20),
  };
}

export function validarCnj(valor: string): boolean {
  const p = decomporCnj(valor);
  if (!p) return false;
  return calcularDigitoCnj(p.sequencial, p.ano, p.segmento, p.tribunal, p.origem) === p.digito;
}

export function segmentoJustica(valor: string): string | undefined {
  const p = decomporCnj(valor);
  return p ? SEGMENTOS_JUSTICA[p.segmento] : undefined;
}
