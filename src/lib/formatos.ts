const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Centavos → 'R$ 1.234,56'. */
export function formatarMoeda(centavos: number): string {
  return moeda.format(centavos / 100);
}

/** Máscara de valor monetário que trata a entrada como centavos digitados. */
export function mascararMoeda(valor: string): string {
  const digitos = valor.replace(/\D/g, '').replace(/^0+/, '');
  if (!digitos) return '';
  return formatarMoeda(Number(digitos));
}

/** 'R$ 1.234,56' ou '1234,56' → 123456 centavos. */
export function lerMoeda(valor: string): number {
  const digitos = valor.replace(/\D/g, '');
  return digitos ? Number(digitos) : 0;
}

export function centavosParaTexto(centavos: number): string {
  return centavos ? formatarMoeda(centavos) : '';
}

/** CPF (11 dígitos) ou CNPJ (14 dígitos) com máscara progressiva. */
export function mascararDocumento(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

export function mascararTelefone(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const primeira = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primeira + ultima).toUpperCase();
}

export function normalizarBusca(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}
