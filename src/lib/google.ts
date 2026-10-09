/**
 * Extrai o ID de um arquivo ou pasta a partir de um link do Google Drive/Docs
 * (ou devolve o próprio texto, se já for um ID). Retorna '' quando não reconhece.
 */
export function extrairIdGoogle(entrada: string): string {
  const texto = entrada.trim();
  if (!texto) return '';

  const padroes = [
    /\/(?:document|spreadsheets|presentation|forms|file)\/d\/([\w-]{10,})/,
    /\/folders\/([\w-]{10,})/,
    /[?&]id=([\w-]{10,})/,
  ];
  for (const padrao of padroes) {
    const achado = texto.match(padrao);
    if (achado) return achado[1];
  }
  return /^[\w-]{10,}$/.test(texto) ? texto : '';
}

export function linkDocumentoGoogle(id: string): string {
  return `https://docs.google.com/document/d/${id}/edit`;
}

export function linkPastaGoogle(id: string): string {
  return `https://drive.google.com/drive/folders/${id}`;
}

const TIPOS: Record<string, string> = {
  'application/vnd.google-apps.document': 'Google Docs',
  'application/vnd.google-apps.spreadsheet': 'Google Planilhas',
  'application/vnd.google-apps.presentation': 'Google Apresentações',
  'application/vnd.google-apps.folder': 'Pasta',
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'image/jpeg': 'Imagem',
  'image/png': 'Imagem',
};

export function descreverTipoArquivo(mimeType: string): string {
  return TIPOS[mimeType] ?? (mimeType.startsWith('image/') ? 'Imagem' : 'Arquivo');
}
