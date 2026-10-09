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
  /** Resumo da última consulta ao DataJud (CNJ). */
  datajud?: ResumoDataJud;
}

export interface ResumoDataJud {
  atualizadoEm: string;
  classe: string;
  orgaoJulgador: string;
  assuntos: string[];
  graus: string[];
  sigiloso: boolean;
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
  /** Identificador do movimento importado do DataJud, para não duplicá-lo. */
  chaveExterna?: string;
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

export const PROVEDORES = {
  google: { nome: 'Google Drive', modelo: 'Google Docs' },
  onedrive: { nome: 'OneDrive', modelo: 'Word no OneDrive' },
} as const;
export type Provedor = keyof typeof PROVEDORES;

/**
 * Documento usado como modelo, com campos {{chave}} a mesclar: no Google, o ID
 * de um Google Docs; no OneDrive, o caminho de um .docx (ex.: /Causa/Modelos/Procuracao.docx).
 */
export interface ModeloDocumento {
  id: string;
  nome: string;
  provedor: Provedor;
  arquivoId: string;
  descricao: string;
}

export type OrigemDocumento = 'drive' | 'gerado';

/** Arquivo do Google Drive ou do OneDrive vinculado a um processo ou cliente. */
export interface Documento {
  id: string;
  nome: string;
  provedor: Provedor;
  driveId: string;
  url: string;
  mimeType: string;
  origem: OrigemDocumento;
  processoId?: string;
  clienteId?: string;
  modeloId?: string;
  criadoEm: string;
}

/** Conexão com um workflow do n8n (Google Drive ou OneDrive). */
export interface Conexao {
  webhookUrl: string;
  token: string;
  /** Pasta onde os documentos gerados são salvos (ID no Google, caminho no OneDrive). */
  pastaDestinoId: string;
  /** Pasta usada por padrão ao importar arquivos (vazio = todo o armazenamento). */
  pastaImportacaoId: string;
}

export interface Integracao {
  google: Conexao;
  onedrive: Conexao;
  /** Chave da API pública do DataJud; vazio usa a chave pública divulgada pelo CNJ. */
  chaveDataJud: string;
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
