/** Datas sem horário são guardadas como 'YYYY-MM-DD'; instantes como ISO completo. */
export type DataISO = string;

export type TipoPessoa = 'PF' | 'PJ';

export interface Cliente {
  id: string;
  tipo: TipoPessoa;
  nome: string;
  documento: string;
  email: string;
  telefone: string;
  endereco: string;
  observacoes: string;
  criadoEm: string;
}

export interface Atendimento {
  id: string;
  clienteId: string;
  processoId?: string;
  data: DataISO;
  assunto: string;
  descricao: string;
}

export const AREAS = [
  'Cível',
  'Trabalhista',
  'Família',
  'Consumidor',
  'Previdenciário',
  'Tributário',
  'Criminal',
  'Empresarial',
  'Outro',
] as const;
export type Area = (typeof AREAS)[number];

/** Fases do pipeline, na ordem em que um processo costuma percorrê-las. */
export const ETAPAS = [
  { id: 'consulta', nome: 'Consulta', cor: '#7C8DB5' },
  { id: 'inicial', nome: 'Petição inicial', cor: '#4F7CAC' },
  { id: 'contestacao', nome: 'Citação / Contestação', cor: '#3E8E9E' },
  { id: 'instrucao', nome: 'Instrução', cor: '#3B9B74' },
  { id: 'sentenca', nome: 'Sentença', cor: '#B38B2D' },
  { id: 'recurso', nome: 'Recurso', cor: '#C0663B' },
  { id: 'execucao', nome: 'Execução', cor: '#A04F7D' },
  { id: 'encerrado', nome: 'Encerrado', cor: '#6B7280' },
] as const;
export type EtapaId = (typeof ETAPAS)[number]['id'];

export type StatusProcesso = 'ativo' | 'arquivado';

export interface Processo {
  id: string;
  numero: string;
  titulo: string;
  clienteId: string;
  parteContraria: string;
  tribunal: string;
  orgao: string;
  area: Area;
  etapa: EtapaId;
  status: StatusProcesso;
  /** Em centavos. */
  valorCausa: number;
  observacoes: string;
  criadoEm: string;
}

export const TIPOS_ANDAMENTO = {
  andamento: 'Andamento',
  peticao: 'Petição',
  despacho: 'Despacho',
  decisao: 'Decisão',
  sentenca: 'Sentença',
  publicacao: 'Publicação',
  nota: 'Anotação',
  etapa: 'Mudança de fase',
} as const;
export type TipoAndamento = keyof typeof TIPOS_ANDAMENTO;

export interface Andamento {
  id: string;
  processoId: string;
  data: DataISO;
  tipo: TipoAndamento;
  descricao: string;
}

export const TIPOS_COMPROMISSO = {
  prazo: { nome: 'Prazo', cor: '#C2410C' },
  audiencia: { nome: 'Audiência', cor: '#7C3AED' },
  tarefa: { nome: 'Tarefa', cor: '#2563EB' },
  reuniao: { nome: 'Reunião', cor: '#0F766E' },
} as const;
export type TipoCompromisso = keyof typeof TIPOS_COMPROMISSO;

export type Prioridade = 'baixa' | 'media' | 'alta';

export interface Compromisso {
  id: string;
  tipo: TipoCompromisso;
  titulo: string;
  data: DataISO;
  /** 'HH:mm' ou vazio. */
  hora: string;
  processoId?: string;
  clienteId?: string;
  descricao: string;
  prioridade: Prioridade;
  concluido: boolean;
  concluidoEm?: string;
}

export type TipoLancamento = 'receita' | 'despesa';

export const CATEGORIAS_LANCAMENTO = {
  honorarios: 'Honorários',
  exito: 'Êxito',
  custas: 'Custas',
  reembolso: 'Reembolso',
  escritorio: 'Escritório',
  outro: 'Outro',
} as const;
export type CategoriaLancamento = keyof typeof CATEGORIAS_LANCAMENTO;

export interface Lancamento {
  id: string;
  tipo: TipoLancamento;
  categoria: CategoriaLancamento;
  descricao: string;
  /** Em centavos. */
  valor: number;
  vencimento: DataISO;
  pago: boolean;
  pagoEm?: DataISO;
  processoId?: string;
  clienteId?: string;
}

/** Documento do Google Docs usado como modelo, com campos {{chave}} a mesclar. */
export interface ModeloDocumento {
  id: string;
  nome: string;
  googleDocId: string;
  descricao: string;
}

export type OrigemDocumento = 'drive' | 'gerado';

/** Arquivo do Google Drive vinculado a um processo ou cliente. */
export interface Documento {
  id: string;
  nome: string;
  driveId: string;
  url: string;
  mimeType: string;
  origem: OrigemDocumento;
  processoId?: string;
  clienteId?: string;
  modeloId?: string;
  criadoEm: string;
}

/** Conexão com o workflow do n8n que fala com o Google Drive e o Google Docs. */
export interface Integracao {
  webhookUrl: string;
  token: string;
  /** Pasta do Drive onde os documentos gerados são salvos. */
  pastaDestinoId: string;
  /** Pasta usada por padrão ao importar arquivos (vazio = todo o Drive). */
  pastaImportacaoId: string;
}

/** Dados de quem assina os documentos, usados nos campos {{advogado.*}}. */
export interface Perfil {
  nome: string;
  oab: string;
  email: string;
  telefone: string;
  cidade: string;
}

export interface Dados {
  clientes: Cliente[];
  atendimentos: Atendimento[];
  processos: Processo[];
  andamentos: Andamento[];
  compromissos: Compromisso[];
  lancamentos: Lancamento[];
  modelos: ModeloDocumento[];
  documentos: Documento[];
}
