/** Hosts de rede local, onde http:// é aceitável para testes (o token não sai da rede). */
function ehHostLocal(host: string): boolean {
  return (
    host === 'localhost' ||
    host.endsWith('.local') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

/** Erro de validação da URL de um webhook, ou null se ela for aceitável. */
export function validarUrlWebhook(url: string): string | null {
  const partes = url.trim().match(/^(https?):\/\/([^/:?#\s]+)(:\d+)?([/?#]\S*)?$/i);
  if (!partes) return 'A URL do webhook deve começar com https://';
  const [, protocolo, host] = partes;
  if (protocolo.toLowerCase() === 'http' && !ehHostLocal(host.toLowerCase())) {
    return 'Use https:// no webhook: com http:// o token iria sem criptografia pela internet.';
  }
  return null;
}

/** Só links https:// podem ser abertos ou guardados (bloqueia javascript:, data:, file: etc.). */
export function ehLinkSeguro(url: unknown): url is string {
  return typeof url === 'string' && /^https:\/\/[^\s/?#]+\S*$/i.test(url.trim());
}
