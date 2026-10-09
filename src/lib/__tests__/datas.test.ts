import {
  calcularVencimento,
  domingoDePascoa,
  ehDiaUtil,
  ehRecessoForense,
  feriadosDoAno,
  lerDataBR,
  mascararData,
  paraISO,
} from '../datas';

describe('feriados', () => {
  it('calcula a Páscoa', () => {
    expect(paraISO(domingoDePascoa(2024))).toBe('2024-03-31');
    expect(paraISO(domingoDePascoa(2025))).toBe('2025-04-20');
    expect(paraISO(domingoDePascoa(2026))).toBe('2026-04-05');
  });

  it('inclui feriados fixos e móveis', () => {
    const f = feriadosDoAno(2026);
    for (const dia of ['2026-01-01', '2026-02-16', '2026-02-17', '2026-04-03', '2026-06-04', '2026-11-20', '2026-12-25']) {
      expect(f.has(dia)).toBe(true);
    }
    expect(feriadosDoAno(2023).has('2023-11-20')).toBe(false);
  });

  it('reconhece dias úteis', () => {
    expect(ehDiaUtil('2026-10-09')).toBe(true); // sexta
    expect(ehDiaUtil('2026-10-10')).toBe(false); // sábado
    expect(ehDiaUtil('2026-10-12')).toBe(false); // feriado
  });

  it('reconhece o recesso forense', () => {
    expect(ehRecessoForense('2026-12-20')).toBe(true);
    expect(ehRecessoForense('2027-01-20')).toBe(true);
    expect(ehRecessoForense('2027-01-21')).toBe(false);
    expect(ehRecessoForense('2026-12-19')).toBe(false);
  });
});

describe('calcularVencimento', () => {
  it('conta dias úteis pulando fins de semana e feriados', () => {
    // 12/10 e 02/11 são feriados.
    expect(calcularVencimento('2026-10-09', 15)).toBe('2026-11-03');
  });

  it('em dias corridos, prorroga quando o fim cai em dia não útil', () => {
    expect(calcularVencimento('2026-10-09', 5, { diasUteis: false })).toBe('2026-10-14');
    expect(calcularVencimento('2026-10-09', 3, { diasUteis: false })).toBe('2026-10-13');
  });

  it('suspende a contagem no recesso de fim de ano', () => {
    expect(calcularVencimento('2026-12-18', 5)).toBe('2027-01-27');
    expect(calcularVencimento('2026-12-18', 5, { considerarRecesso: false })).toBe('2026-12-28');
  });
});

describe('datas no formato brasileiro', () => {
  it('mascara e interpreta dd/mm/aaaa', () => {
    expect(mascararData('09102026')).toBe('09/10/2026');
    expect(mascararData('0910')).toBe('09/10');
    expect(lerDataBR('09/10/2026')).toBe('2026-10-09');
    expect(lerDataBR('31/02/2026')).toBeNull();
    expect(lerDataBR('09/10')).toBeNull();
  });
});
