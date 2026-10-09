// Preenche os campos nas partes de texto do .docx e devolve o caminho completo
// de cada parte no nome do arquivo, para o nó Compression remontar o zip.
// mesclarXmlWord e ehParteComTexto vêm de codigo/mesclarDocx.js.
const item = $input.first();
const campos = $('Validar pedido').first().json.campos;
const partes = [];
for (const [chave, binario] of Object.entries(item.binary ?? {})) {
  const caminho = binario.directory ? `${binario.directory}/${binario.fileName}` : binario.fileName;
  if (ehParteComTexto(caminho)) {
    const xml = (await this.helpers.getBinaryDataBuffer(0, chave)).toString('utf8');
    const mesclado = mesclarXmlWord(xml, campos);
    item.binary[chave] = await this.helpers.prepareBinaryData(Buffer.from(mesclado, 'utf8'), caminho, 'application/xml');
  }
  item.binary[chave].fileName = caminho;
  delete item.binary[chave].directory;
  partes.push(chave);
}
if (!partes.some((p) => item.binary[p].fileName === 'word/document.xml')) {
  throw new Error('O arquivo de modelo não parece ser um documento do Word (.docx).');
}
item.json = { partes: partes.join(',') };
return [item];
