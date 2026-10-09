import type { Publicacao } from '../djen';
import { dataDaPublicacao, lerNumero, prazosLegais, prazosNoTexto, ritoDaPublicacao, sugerirPrazos } from '../prazosPublicacao';

const CIVEL = '00157865320188080035'; // J = 8 (Justiça Estadual)
const TRABALHO = '00012345620255050001'; // J = 5 (Justiça do Trabalho)

function publicacao(campos: Partial<Publicacao>): Publicacao {
  return {
    chave: 'x',
    dataDisponibilizacao: '2026-10-05',
    tribunal: 'TJES',
    tipoComunicacao: 'Intimação',
    tipoDocumento: 'Despacho',
    orgao: '2ª Vara Cível',
    classe: 'PROCEDIMENTO COMUM CÍVEL',
    numeroProcesso: CIVEL,
    texto: '',
    link: '',
    certidao: '',
    destinatarios: [],
    advogados: [],
    ...campos,
  };
}

describe('leitura do prazo no texto', () => {
  it('entende números por extenso', () => {
    expect(lerNumero('15')).toBe(15);
    expect(lerNumero('quinze')).toBe(15);
    expect(lerNumero('Quarenta e Cinco')).toBe(45);
    expect(lerNumero('três')).toBe(3);
    expect(lerNumero('alguns')).toBeNull();
  });

  it('acha o prazo e o ato fixados pelo juiz', () => {
    const achados = prazosNoTexto(
      'DESPACHO. Cite-se o réu para, no prazo de 15 (quinze) dias, apresentar contestação. ' +
        'Após, intime-se o autor para se manifestar em 5 dias. Recolha as custas em 10 (dez) dias corridos.',
    );
    expect(achados.map((a) => [a.ato, a.dias, a.corridos])).toEqual([
      ['Contestação', 15, false],
      ['Manifestação', 5, false],
      ['Recolhimento de custas', 10, true],
    ]);
    expect(achados[0].trecho).toBe('Cite-se o réu para, no prazo de 15 (quinze) dias, apresentar contestação.');
  });

  it('aceita texto em maiúsculas e só por extenso', () => {
    expect(prazosNoTexto('Manifeste-se o autor sobre a contestação em 15 dias.')[0].ato).toBe('Réplica');
    expect(prazosNoTexto('INTIME-SE A PARTE AUTORA PARA APRESENTAR RÉPLICA NO PRAZO DE QUINZE DIAS ÚTEIS.')).toMatchObject([
      { ato: 'Réplica', dias: 15, corridos: false },
    ]);
  });
});

describe('contagem a partir do Diário', () => {
  it('publica no primeiro dia útil após a disponibilização', () => {
    expect(dataDaPublicacao('2026-10-05')).toBe('2026-10-06'); // segunda → terça
    expect(dataDaPublicacao('2026-10-09')).toBe('2026-10-13'); // sexta → terça (12/10 é feriado)
  });

  it('calcula o vencimento do prazo fixado no texto em dias úteis', () => {
    const [prazo] = sugerirPrazos(
      publicacao({ texto: 'Intime-se a parte autora para, no prazo de 15 (quinze) dias, apresentar réplica à contestação.' }),
    );
    // Publicado em 06/10; conta de 07/10, pulando fins de semana e 12/10.
    expect(prazo).toMatchObject({ titulo: 'Réplica', dias: 15, diasUteis: true, origem: 'texto', publicacao: '2026-10-06', vencimento: '2026-10-28' });
    expect(prazo.fundamento).toContain('no prazo de 15 (quinze) dias');
  });

  it('usa o prazo da lei quando o texto não fixa prazo', () => {
    const prazos = sugerirPrazos(publicacao({ tipoDocumento: 'Sentença', texto: 'JULGO PROCEDENTE o pedido.' }));
    expect(prazos.map((p) => [p.titulo, p.dias, p.origem])).toEqual([
      ['Apelação', 15, 'lei'],
      ['Embargos de declaração', 5, 'lei'],
    ]);
  });

  it('conta dias corridos no processo penal', () => {
    const [apelacao] = sugerirPrazos(
      publicacao({ tipoDocumento: 'Sentença', classe: 'AÇÃO PENAL - PROCEDIMENTO ORDINÁRIO', texto: 'Condeno o réu.' }),
    );
    expect(apelacao).toMatchObject({ titulo: 'Apelação', dias: 5, diasUteis: false, vencimento: '2026-10-13' });
  });

  it('suspende a contagem no recesso de fim de ano', () => {
    const [prazo] = sugerirPrazos(publicacao({ dataDisponibilizacao: '2026-12-14', texto: 'Manifeste-se em 10 dias.' }));
    expect(prazo.publicacao).toBe('2026-12-15');
    // 16, 17 e 18/12; recesso de 20/12 a 20/01; retoma em 21/01/2027 (quinta) até o 10º dia útil.
    expect(prazo.vencimento).toBe('2027-01-29');
  });
});

describe('prazos da lei por rito', () => {
  it('identifica o rito', () => {
    expect(ritoDaPublicacao(publicacao({}))).toBe('civel');
    expect(ritoDaPublicacao(publicacao({ numeroProcesso: TRABALHO }))).toBe('trabalho');
    expect(ritoDaPublicacao(publicacao({ classe: 'PROCEDIMENTO DO JUIZADO ESPECIAL CÍVEL' }))).toBe('juizado');
    expect(ritoDaPublicacao(publicacao({ classe: 'HABEAS CORPUS CRIMINAL' }))).toBe('criminal');
  });

  it('sugere os recursos de cada rito', () => {
    const titulos = (p: Partial<Publicacao>) => prazosLegais(publicacao(p)).map((x) => `${x.titulo} ${x.dias}`);
    expect(titulos({ tipoComunicacao: 'Citação', tipoDocumento: '' })).toEqual(['Contestação 15']);
    expect(titulos({ tipoDocumento: 'Sentença', numeroProcesso: TRABALHO })).toEqual(['Recurso ordinário 8', 'Embargos de declaração 5']);
    expect(titulos({ tipoDocumento: 'Sentença', classe: 'JUIZADO ESPECIAL CÍVEL' })).toEqual(['Recurso inominado 10', 'Embargos de declaração 5']);
    expect(titulos({ tipoDocumento: 'Acórdão' })).toEqual(['Embargos de declaração 5', 'Recurso especial/extraordinário 15']);
    expect(titulos({ tipoDocumento: 'Decisão' })).toEqual(['Embargos de declaração 5', 'Agravo de instrumento (se cabível) 15']);
    expect(titulos({ tipoDocumento: 'Despacho' })).toEqual(['Manifestação 5']);
    expect(titulos({ tipoComunicacao: 'Edital', tipoDocumento: '' })).toEqual([]);
  });
});
