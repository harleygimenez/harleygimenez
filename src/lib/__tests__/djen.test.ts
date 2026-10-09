import {
  andamentoDaPublicacao,
  consultarPublicacoes,
  converterRespostaDJEN,
  ErroDJEN,
  lerOab,
  montarConsultaDJEN,
  textoPuro,
  type RespostaDJEN,
} from '../djen';

/** Formato da API Comunica PJe (campos em snake_case e camelCase misturados, como na resposta real). */
const RESPOSTA_DJEN: RespostaDJEN = {
  status: 'success',
  message: 'Sucesso',
  count: 3,
  items: [
    {
      id: 101,
      data_disponibilizacao: '2026-10-05',
      siglaTribunal: 'TJES',
      tipoComunicacao: 'Intimação',
      nomeOrgao: 'Vila Velha - 2ª Vara Cível',
      texto:
        '<p>DESPACHO</p><p>Intime-se a parte autora para, no prazo de 15 (quinze) dias, apresentar r&eacute;plica &agrave; contesta&ccedil;&atilde;o.</p><p>Vila Velha, 1&ordm; de outubro de 2026.</p>',
      numero_processo: '00157865320188080035',
      meio: 'D',
      link: 'https://pje.tjes.jus.br/pje/ConsultaDocumento/listView.seam?x=1',
      tipoDocumento: 'Despacho',
      nomeClasse: 'PROCEDIMENTO COMUM CÍVEL',
      hash: 'aBc123XyZ987',
      numeroprocessocommascara: '0015786-53.2018.8.08.0035',
      destinatarios: [
        { nome: 'MARIA DA SILVA', polo: 'A', comunicacao_id: 101 },
      ],
      destinatarioadvogados: [
        { id: 1, comunicacao_id: 101, advogado: { nome: 'HARLEY GIMENEZ', numero_oab: '12345', uf_oab: 'ES' } },
      ],
    },
    {
      id: 102,
      data_disponibilizacao: '2026-09-01',
      siglaTribunal: 'TJES',
      tipoComunicacao: 'Intimação',
      nomeOrgao: 'Vila Velha - 2ª Vara Cível',
      texto: 'SENTENÇA. Ante o exposto, JULGO PROCEDENTE o pedido. Publique-se. Intimem-se.',
      numero_processo: '00157865320188080035',
      tipoDocumento: 'Sentença',
      nomeClasse: 'PROCEDIMENTO COMUM CÍVEL',
      hash: 'Sent000000002',
      link: 'javascript:alert(1)',
      destinatarios: [
        { nome: 'MARIA DA SILVA', polo: 'A' },
        { nome: 'BANCO EXEMPLO S/A', polo: 'P' },
      ],
      destinatarioadvogados: [],
    },
    // Duplicado e itens malformados são descartados.
    { id: 101, data_disponibilizacao: '2026-10-05', numero_processo: '00157865320188080035', hash: 'aBc123XyZ987' },
    { id: 999, data_disponibilizacao: '2026-10-05', numero_processo: '123' },
  ],
};

function respostaJson(corpo: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo } as Response;
}

describe('texto das publicações', () => {
  it('converte o HTML em texto puro com acentos e parágrafos', () => {
    expect(textoPuro('<p>r&eacute;plica &agrave; contesta&ccedil;&atilde;o</p><p>1&ordm; &amp; 2&#170; &#x41;</p>')).toBe(
      'réplica à contestação\n1º & 2ª A',
    );
  });

  it('remove scripts e não deixa marcação', () => {
    const t = textoPuro('<script>alert(1)</script><b onclick="x()">Decisão</b><img src=x onerror=y>');
    expect(t).toBe('Decisão');
    expect(t).not.toMatch(/[<>]/);
  });
});

describe('resposta do DJEN', () => {
  it('lê as publicações, remove duplicados e malformados', () => {
    const { total, publicacoes } = converterRespostaDJEN(RESPOSTA_DJEN);
    expect(total).toBe(3);
    expect(publicacoes).toHaveLength(2);
    const [despacho, sentenca] = publicacoes;
    expect(despacho).toMatchObject({
      chave: 'aBc123XyZ987',
      dataDisponibilizacao: '2026-10-05',
      tribunal: 'TJES',
      tipoDocumento: 'Despacho',
      numeroProcesso: '00157865320188080035',
      certidao: 'https://comunicaapi.pje.jus.br/api/v1/comunicacao/aBc123XyZ987/certidao',
      destinatarios: [{ nome: 'MARIA DA SILVA', polo: 'A' }],
      advogados: [{ nome: 'HARLEY GIMENEZ', oab: '12345', uf: 'ES' }],
    });
    expect(despacho.texto).toContain('apresentar réplica à contestação');
    // Link que não é https é descartado.
    expect(sentenca.link).toBe('');
  });

  it('aceita a variante com "itens" e datas dd/mm/aaaa', () => {
    const { publicacoes } = converterRespostaDJEN({
      total: 1,
      itens: [{ id: 5, datadisponibilizacao: '03/02/2026', numeroProcesso: '0015786-53.2018.8.08.0035' }],
    });
    expect(publicacoes[0]).toMatchObject({ chave: '5', dataDisponibilizacao: '2026-02-03' });
  });

  it('vira andamento com inteiro teor, tipo e link da certidão', () => {
    const [despacho, sentenca] = converterRespostaDJEN(RESPOSTA_DJEN).publicacoes;
    expect(andamentoDaPublicacao(despacho)).toMatchObject({
      data: '2026-10-05',
      tipo: 'despacho',
      descricao: 'Intimação · Despacho — Vila Velha - 2ª Vara Cível · TJES',
      chaveExterna: 'djen:aBc123XyZ987',
      link: 'https://comunicaapi.pje.jus.br/api/v1/comunicacao/aBc123XyZ987/certidao',
    });
    expect(andamentoDaPublicacao(sentenca).tipo).toBe('sentenca');
  });
});

describe('consulta ao DJEN', () => {
  it('lê a OAB em vários formatos', () => {
    expect(lerOab('OAB/ES 12.345')).toEqual({ numero: '12345', uf: 'ES' });
    expect(lerOab('123456/SP')).toEqual({ numero: '123456', uf: 'SP' });
    expect(lerOab('ES012345')).toEqual({ numero: '12345', uf: 'ES' });
    expect(lerOab('12345')).toBeNull();
  });

  it('monta a URL e valida os filtros', () => {
    expect(montarConsultaDJEN({ numeroProcesso: '0015786-53.2018.8.08.0035' }, 1, 100)).toBe(
      'https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroProcesso=00157865320188080035&pagina=1&itensPorPagina=100',
    );
    expect(
      montarConsultaDJEN({ numeroOab: '12.345', ufOab: 'es', dataInicio: '2026-09-01', dataFim: '2026-10-01' }, 2, 50),
    ).toBe(
      'https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroOab=12345&ufOab=ES&dataDisponibilizacaoInicio=2026-09-01&dataDisponibilizacaoFim=2026-10-01&pagina=2&itensPorPagina=50',
    );
    expect(() => montarConsultaDJEN({ numeroProcesso: '0015786-54.2018.8.08.0035' }, 1, 100)).toThrow(ErroDJEN);
    expect(() => montarConsultaDJEN({ numeroOab: '1&x=2', ufOab: 'ES' }, 1, 100)).toThrow(ErroDJEN);
    expect(() => montarConsultaDJEN({ numeroOab: '123', ufOab: 'XX' }, 1, 100)).toThrow(ErroDJEN);
    expect(() => montarConsultaDJEN({}, 1, 100)).toThrow(ErroDJEN);
  });

  it('percorre as páginas até o total', async () => {
    const urls: string[] = [];
    const pagina = (n: number) => ({
      count: 3,
      items: Array.from({ length: n === 1 ? 2 : 1 }, (_, i) => ({
        id: n * 10 + i,
        data_disponibilizacao: `2026-10-0${n + i}`,
        numero_processo: '00157865320188080035',
      })),
    });
    const fetchFalso = jest.fn(async (url: string) => {
      urls.push(url);
      return respostaJson(pagina(Number(new URL(url).searchParams.get('pagina'))));
    });
    const r = await consultarPublicacoes(
      { numeroProcesso: '0015786-53.2018.8.08.0035' },
      { fetch: fetchFalso as unknown as typeof fetch, itensPorPagina: 2 },
    );
    expect(urls).toHaveLength(2);
    expect(r.map((p) => p.chave)).toEqual(['11', '20', '10']);
  });

  it('explica o limite de consultas e o bloqueio', async () => {
    const com = (status: number) => (async () => respostaJson({}, status)) as unknown as typeof fetch;
    await expect(consultarPublicacoes({ numeroOab: '1', ufOab: 'ES' }, { fetch: com(429) })).rejects.toThrow(/Aguarde um minuto/);
    await expect(consultarPublicacoes({ numeroOab: '1', ufOab: 'ES' }, { fetch: com(403) })).rejects.toThrow(/recusou/);
    await expect(consultarPublicacoes({ numeroOab: '1', ufOab: 'ES' }, { fetch: com(500) })).rejects.toThrow(/erro 500/);
  });
});
