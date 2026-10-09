import { mascararCnj, segmentoJustica } from '../lib/cnj';
import type { Destinatario, Publicacao } from '../lib/djen';
import { normalizarBusca } from '../lib/formatos';
import { ritoDaPublicacao } from '../lib/prazosPublicacao';
import type { Area, EtapaId, Processo, TipoPessoa } from './types';

/** Processo encontrado no Diário, com as publicações dele. */
export interface ProcessoDoDiario {
  /** 20 dígitos. */
  numero: string;
  tribunal: string;
  orgao: string;
  classe: string;
  partes: Destinatario[];
  publicacoes: Publicacao[];
}

/** Agrupa as publicações por número de processo, do mais recente para o mais antigo. */
export function agruparPorProcesso(publicacoes: Publicacao[]): ProcessoDoDiario[] {
  const grupos = new Map<string, ProcessoDoDiario>();
  for (const p of publicacoes) {
    let grupo = grupos.get(p.numeroProcesso);
    if (!grupo) {
      grupo = { numero: p.numeroProcesso, tribunal: p.tribunal, orgao: p.orgao, classe: p.classe, partes: [], publicacoes: [] };
      grupos.set(p.numeroProcesso, grupo);
    }
    grupo.publicacoes.push(p);
    for (const d of p.destinatarios) {
      if (!grupo.partes.some((x) => normalizarBusca(x.nome) === normalizarBusca(d.nome))) grupo.partes.push(d);
    }
    grupo.tribunal ||= p.tribunal;
    grupo.orgao ||= p.orgao;
    grupo.classe ||= p.classe;
  }
  const lista = [...grupos.values()];
  for (const g of lista) g.publicacoes.sort((a, b) => b.dataDisponibilizacao.localeCompare(a.dataDisponibilizacao));
  return lista.sort((a, b) => b.publicacoes[0].dataDisponibilizacao.localeCompare(a.publicacoes[0].dataDisponibilizacao));
}

/**
 * Parte que provavelmente é o cliente. A publicação não diz qual parte o advogado
 * representa; quando só uma parte é intimada, costuma ser a do advogado. Senão, usa
 * o polo ativo. O usuário confirma na tela antes de importar.
 */
export function sugerirCliente(processo: ProcessoDoDiario, nomesAdvogados: string[] = []): string {
  const advogados = new Set(nomesAdvogados.map(normalizarBusca));
  const partes = processo.partes.filter((p) => !advogados.has(normalizarBusca(p.nome)));
  if (partes.length === 0) return '';
  if (partes.length === 1) return partes[0].nome;
  return (partes.find((p) => p.polo === 'A') ?? partes[0]).nome;
}

const PESSOA_JURIDICA =
  /\b(ltda|s\/?a|s\.a\.?|eireli|epp|me|banco|companhia|cia|associacao|sindicato|municipio|estado|uniao|instituto|fundacao|condominio|cooperativa|empresa|servicos|comercio|industria|inss|fazenda)\b/;

export function tipoPessoaPeloNome(nome: string): TipoPessoa {
  return PESSOA_JURIDICA.test(normalizarBusca(nome)) ? 'PJ' : 'PF';
}

export function areaProvavel(processo: Pick<ProcessoDoDiario, 'numero' | 'classe' | 'orgao'>): Area {
  const texto = normalizarBusca(`${processo.classe} ${processo.orgao}`);
  const rito = ritoDaPublicacao({ classe: processo.classe, orgao: processo.orgao, numeroProcesso: processo.numero });
  if (rito === 'criminal') return 'Criminal';
  if (rito === 'trabalho') return 'Trabalhista';
  if (/familia|alimentos|divorcio|guarda|inventario|sucess/.test(texto)) return 'Família';
  if (/fazenda|fiscal|tribut/.test(texto)) return 'Tributário';
  if (/previd|inss/.test(texto)) return 'Previdenciário';
  if (/consumo|consumidor/.test(texto)) return 'Consumidor';
  if (/falencia|recupera|empresarial/.test(texto)) return 'Empresarial';
  return 'Cível';
}

/** Fase provável pelo ato mais avançado já publicado. */
export function etapaProvavel(processo: Pick<ProcessoDoDiario, 'publicacoes'>): EtapaId {
  const atos = normalizarBusca(processo.publicacoes.map((p) => `${p.tipoDocumento} ${p.tipoComunicacao}`).join(' '));
  if (/acordao/.test(atos)) return 'recurso';
  if (/senten/.test(atos)) return 'sentenca';
  if (/audiencia|instrucao/.test(atos)) return 'instrucao';
  return 'contestacao';
}

export function novoProcessoDoDiario(
  processo: ProcessoDoDiario,
  clienteId: string,
  clienteNome: string,
  agora: Date = new Date(),
): Omit<Processo, 'id'> {
  const contrarias = processo.partes
    .filter((p) => normalizarBusca(p.nome) !== normalizarBusca(clienteNome))
    .map((p) => p.nome);
  const classe = processo.classe ? processo.classe.charAt(0) + processo.classe.slice(1).toLowerCase() : 'Processo';
  return {
    numero: mascararCnj(processo.numero),
    titulo: `${classe}${clienteNome ? ` — ${clienteNome}` : ''}`.slice(0, 300),
    clienteId,
    parteContraria: contrarias.join(', ').slice(0, 300),
    tribunal: processo.tribunal || segmentoJustica(processo.numero) || '',
    orgao: processo.orgao,
    area: areaProvavel(processo),
    etapa: etapaProvavel(processo),
    status: 'ativo',
    valorCausa: 0,
    observacoes: 'Cadastrado automaticamente a partir do Diário de Justiça Eletrônico Nacional (DJEN).',
    criadoEm: agora.toISOString(),
  };
}
