import { ehParteComTexto, mesclarXmlWord } from '../../../integracoes/n8n/codigo/mesclarDocx';

const doc = (corpo: string) =>
  `<?xml version="1.0"?><w:document xmlns:w="w"><w:body>${corpo}<w:sectPr/></w:body></w:document>`;

describe('mesclarXmlWord', () => {
  it('substitui campos inteiros em um trecho', () => {
    const xml = doc('<w:p><w:r><w:t>Outorgante: {{cliente.nome}}.</w:t></w:r></w:p>');
    expect(mesclarXmlWord(xml, { 'cliente.nome': 'Ana' })).toContain('<w:t xml:space="preserve">Outorgante: Ana.</w:t>');
  });

  it('junta campos que o Word quebrou em vários trechos, preservando as tags', () => {
    const xml = doc(
      '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Nome: {{</w:t></w:r><w:proofErr w:type="spellStart"/>' +
        '<w:r><w:t>cliente</w:t></w:r><w:r><w:t xml:space="preserve">.nome}} e OAB {{advogado.oab}}</w:t></w:r></w:p>',
    );
    const r = mesclarXmlWord(xml, { 'cliente.nome': 'Ana & Cia <Ltda>', 'advogado.oab': 'OAB/ES 1.234' });
    expect(r).toContain('<w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Nome: Ana &amp; Cia &lt;Ltda&gt;</w:t>');
    expect(r).toContain('<w:proofErr w:type="spellStart"/>');
    expect(r).toContain('<w:r><w:t xml:space="preserve"></w:t></w:r>');
    expect(r).toContain('<w:t xml:space="preserve"> e OAB OAB/ES 1.234</w:t>');
    expect(r).not.toContain('{{');
  });

  it('mantém campos desconhecidos e parágrafos sem campos intactos', () => {
    const intacto = '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>Título &amp; subtítulo</w:t></w:r></w:p>';
    const xml = doc(`${intacto}<w:p><w:r><w:t>{{nao.existe}} {{data.hoje}}</w:t></w:r></w:p>`);
    const r = mesclarXmlWord(xml, { 'data.hoje': '09/10/2026' });
    expect(r).toContain(intacto);
    expect(r).toContain('{{nao.existe}} 09/10/2026');
  });

  it('funciona em tabelas e com campos vazios', () => {
    const xml = doc('<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Processo: {{processo.numero}}</w:t></w:r></w:p></w:tc></w:tr></w:tbl>');
    expect(mesclarXmlWord(xml, { 'processo.numero': '' })).toContain('<w:t xml:space="preserve">Processo: </w:t>');
  });

  it('não confunde <w:tab/> e <w:tbl> com trechos de texto', () => {
    const xml = doc('<w:p><w:r><w:tab/><w:t>{{a}}</w:t></w:r></w:p>');
    expect(mesclarXmlWord(xml, { a: 'x' })).toContain('<w:tab/><w:t xml:space="preserve">x</w:t>');
  });

  it('identifica as partes do docx que têm texto', () => {
    expect(ehParteComTexto('word/document.xml')).toBe(true);
    expect(ehParteComTexto('word/header2.xml')).toBe(true);
    expect(ehParteComTexto('word/styles.xml')).toBe(false);
    expect(ehParteComTexto('[Content_Types].xml')).toBe(false);
  });
});
