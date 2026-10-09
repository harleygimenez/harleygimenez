import type { Advogado, Perfil } from '../data/types';
import { lerOab } from './djen';

export interface AdvogadoComOab {
  nome: string;
  oab: string;
  uf: string;
}

/** Titular (perfil) e equipe com OAB válida, sem repetir a mesma inscrição. */
export function advogadosParaBusca(perfil: Perfil, equipe: Advogado[]): AdvogadoComOab[] {
  const lista: AdvogadoComOab[] = [];
  const titular = lerOab(perfil.oab);
  if (titular) lista.push({ nome: perfil.nome || 'Você', oab: titular.numero, uf: titular.uf });
  for (const a of equipe) {
    if (!/^\d{1,7}$/.test(a.oab) || !a.uf) continue;
    lista.push({ nome: a.nome, oab: a.oab, uf: a.uf });
  }
  const vistos = new Set<string>();
  return lista.filter((a) => {
    const chave = `${a.oab}/${a.uf}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

export function formatarOab(a: Pick<AdvogadoComOab, 'oab' | 'uf'>): string {
  return `OAB/${a.uf} ${a.oab.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}
