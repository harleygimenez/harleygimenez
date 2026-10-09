import { iniciais, lerMoeda, mascararDocumento, mascararMoeda, mascararTelefone, normalizarBusca } from '../formatos';

// Intl usa espaço não separável entre "R$" e o valor.
const semNbsp = (t: string) => t.replace(/\u00a0/g, ' ');

describe('formatos', () => {
  it('mascara e lê valores em reais como centavos', () => {
    expect(semNbsp(mascararMoeda('123456'))).toBe('R$ 1.234,56');
    expect(mascararMoeda('')).toBe('');
    expect(lerMoeda('R$ 1.234,56')).toBe(123456);
    expect(lerMoeda('')).toBe(0);
  });

  it('mascara CPF, CNPJ e telefone', () => {
    expect(mascararDocumento('12345678909')).toBe('123.456.789-09');
    expect(mascararDocumento('12345678000195')).toBe('12.345.678/0001-95');
    expect(mascararTelefone('11987654321')).toBe('(11) 98765-4321');
    expect(mascararTelefone('1134567890')).toBe('(11) 3456-7890');
  });

  it('gera iniciais e normaliza buscas', () => {
    expect(iniciais('Ana Paula Ribeiro')).toBe('AR');
    expect(iniciais('  ')).toBe('?');
    expect(normalizarBusca('Família ÇÃO')).toBe('familia cao');
  });
});
