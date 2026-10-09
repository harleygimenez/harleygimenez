import type { ModeloDocumento, Provedor } from '../data/types';
import { extrairIdGoogle, linkDocumentoGoogle } from './google';

/**
 * Normaliza um caminho do OneDrive ("OpenJus\\Modelos\\" → "/OpenJus/Modelos").
 * Retorna '' se tiver caracteres que o OneDrive não aceita ou "..".
 */
export function normalizarCaminhoOneDrive(entrada: string): string {
  const partes = entrada.trim().replace(/\\/g, '/').split('/').map((p) => p.trim()).filter(Boolean);
  if (partes.length === 0) return entrada.trim() ? '/' : '';
  if (partes.some((p) => p === '.' || p === '..' || /["*:<>?|#%]/.test(p))) return '';
  return `/${partes.join('/')}`;
}

/** Converte o que o usuário colou (link do Google, caminho do OneDrive) no identificador usado pelo n8n. */
export function identificarArquivo(provedor: Provedor, entrada: string): string {
  return provedor === 'google' ? extrairIdGoogle(entrada) : normalizarCaminhoOneDrive(entrada);
}

/** Erro de validação de um modelo, ou null. */
export function validarModelo(provedor: Provedor, entrada: string): string | null {
  const id = identificarArquivo(provedor, entrada);
  if (provedor === 'google') return id ? null : 'Cole o link do documento no Google Docs.';
  if (!id || id === '/') return 'Informe o caminho do arquivo no OneDrive, como /OpenJus/Modelos/Procuracao.docx.';
  return /\.docx$/i.test(id) ? null : 'O modelo do OneDrive deve ser um arquivo .docx do Word.';
}

/** Link para abrir o modelo, quando dá para montá-lo só com o identificador. */
export function linkDoModelo(modelo: ModeloDocumento): string | null {
  return modelo.provedor === 'google' ? linkDocumentoGoogle(modelo.arquivoId) : null;
}

/** Texto exibido no campo de edição a partir do identificador salvo. */
export function entradaDoModelo(modelo: ModeloDocumento): string {
  return modelo.provedor === 'google' ? linkDocumentoGoogle(modelo.arquivoId) : modelo.arquivoId;
}
