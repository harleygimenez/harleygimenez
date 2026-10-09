import type { Cliente, DataISO, ModeloDocumento, Perfil, Processo } from '../data/types';
import { ETAPAS } from '../data/types';
import { formatarData, formatarDataExtenso } from './datas';
import { formatarMoeda } from './formatos';

/** Campos que podem ser usados nos modelos, escritos como {{chave}} no Google Docs. */
export const CAMPOS_DISPONIVEIS: { chave: string; descricao: string }[] = [
  { chave: 'cliente.nome', descricao: 'Nome ou razão social' },
  { chave: 'cliente.documento', descricao: 'CPF ou CNPJ' },
  { chave: 'cliente.tipo_documento', descricao: '"CPF" ou "CNPJ"' },
  { chave: 'cliente.email', descricao: 'E-mail' },
  { chave: 'cliente.telefone', descricao: 'Telefone' },
  { chave: 'cliente.endereco', descricao: 'Endereço' },
  { chave: 'processo.numero', descricao: 'Número CNJ' },
  { chave: 'processo.titulo', descricao: 'Título do processo' },
  { chave: 'processo.parte_contraria', descricao: 'Parte contrária' },
  { chave: 'processo.tribunal', descricao: 'Tribunal' },
  { chave: 'processo.orgao', descricao: 'Órgão / vara' },
  { chave: 'processo.area', descricao: 'Área do direito' },
  { chave: 'processo.fase', descricao: 'Fase atual' },
  { chave: 'processo.valor_causa', descricao: 'Valor da causa (R$)' },
  { chave: 'advogado.nome', descricao: 'Seu nome (Ajustes > Integrações)' },
  { chave: 'advogado.oab', descricao: 'Sua inscrição na OAB' },
  { chave: 'advogado.email', descricao: 'Seu e-mail' },
  { chave: 'advogado.telefone', descricao: 'Seu telefone' },
  { chave: 'advogado.cidade', descricao: 'Cidade do escritório' },
  { chave: 'data.hoje', descricao: 'Data de hoje (dd/mm/aaaa)' },
  { chave: 'data.extenso', descricao: 'Data por extenso, ex.: 9 de outubro de 2026' },
];

export interface ContextoMesclagem {
  cliente?: Cliente;
  processo?: Processo;
  perfil: Perfil;
  hoje: DataISO;
}

function dataPorExtenso(data: DataISO): string {
  // "Sexta-feira, 9 de outubro" → "9 de outubro de 2026"
  const semDiaDaSemana = formatarDataExtenso(data).split(', ')[1] ?? '';
  return `${semDiaDaSemana} de ${data.slice(0, 4)}`;
}

/** Valores de todos os campos; os que não se aplicam ficam vazios. */
export function camposDeMesclagem({ cliente, processo, perfil, hoje }: ContextoMesclagem): Record<string, string> {
  return {
    'cliente.nome': cliente?.nome ?? '',
    'cliente.documento': cliente?.documento ?? '',
    'cliente.tipo_documento': cliente ? (cliente.tipo === 'PJ' ? 'CNPJ' : 'CPF') : '',
    'cliente.email': cliente?.email ?? '',
    'cliente.telefone': cliente?.telefone ?? '',
    'cliente.endereco': cliente?.endereco ?? '',
    'processo.numero': processo?.numero ?? '',
    'processo.titulo': processo?.titulo ?? '',
    'processo.parte_contraria': processo?.parteContraria ?? '',
    'processo.tribunal': processo?.tribunal ?? '',
    'processo.orgao': processo?.orgao ?? '',
    'processo.area': processo?.area ?? '',
    'processo.fase': processo ? (ETAPAS.find((e) => e.id === processo.etapa)?.nome ?? '') : '',
    'processo.valor_causa': processo?.valorCausa ? formatarMoeda(processo.valorCausa).replace(/ /g, ' ') : '',
    'advogado.nome': perfil.nome,
    'advogado.oab': perfil.oab,
    'advogado.email': perfil.email,
    'advogado.telefone': perfil.telefone,
    'advogado.cidade': perfil.cidade,
    'data.hoje': formatarData(hoje),
    'data.extenso': dataPorExtenso(hoje),
  };
}

/** Ex.: "Procuração - Ana Paula Ribeiro - 09-10-2026". */
export function nomeArquivoPadrao(modelo: ModeloDocumento, cliente: Cliente | undefined, hoje: DataISO): string {
  const data = formatarData(hoje).replace(/\//g, '-');
  return [modelo.nome, cliente?.nome, data].filter(Boolean).join(' - ');
}
