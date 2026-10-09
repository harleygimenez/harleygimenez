import { calcularDigitoCnj, mascararCnj, segmentoJustica, validarCnj } from '../cnj';

describe('número CNJ', () => {
  it('calcula o dígito verificador por módulo 97', () => {
    expect(calcularDigitoCnj('0001234', '2020', '8', '26', '0100')).toBe('13');
  });

  it('valida números com dígito correto e rejeita os demais', () => {
    expect(validarCnj('0001234-13.2020.8.26.0100')).toBe(true);
    expect(validarCnj('00012341320208260100')).toBe(true);
    expect(validarCnj('0001234-14.2020.8.26.0100')).toBe(false);
    expect(validarCnj('0001235-13.2020.8.26.0100')).toBe(false);
    expect(validarCnj('0001234-13.2020.8.26')).toBe(false);
  });

  it('aplica a máscara enquanto o usuário digita', () => {
    expect(mascararCnj('0001234')).toBe('0001234');
    expect(mascararCnj('000123413')).toBe('0001234-13');
    expect(mascararCnj('00012341320208260100')).toBe('0001234-13.2020.8.26.0100');
    expect(mascararCnj('00012341320208260100999')).toBe('0001234-13.2020.8.26.0100');
  });

  it('identifica o segmento da Justiça', () => {
    expect(segmentoJustica('0001234-13.2020.8.26.0100')).toBe('Justiça Estadual');
    expect(segmentoJustica('123')).toBeUndefined();
  });
});
