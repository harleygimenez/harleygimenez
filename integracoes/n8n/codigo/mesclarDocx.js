/**
 * Preenche campos {{chave}} no XML de um documento do Word (word/document.xml,
 * cabeçalhos e rodapés). O Word costuma quebrar um mesmo campo em vários
 * trechos <w:t> (por correção ortográfica, formatação etc.), então a busca é
 * feita no texto de cada parágrafo inteiro e só o conteúdo dos <w:t> é
 * reescrito: as tags do documento nunca são alteradas, só o texto delas.
 *
 * Este arquivo é embutido no workflow do OneDrive pelo gerar-workflows.mjs e
 * também é testado pelo Jest do app.
 */

const CAMPO = /\{\{\s*([\w.]+)\s*\}\}/g;
const TRECHO = /<w:t(\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
const PARAGRAFO = /<w:p[\s>][\s\S]*?<\/w:p>/g;

function desescapar(texto) {
  return texto
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function escapar(texto) {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function mesclarParagrafo(paragrafo, campos) {
  const trechos = [];
  for (const m of paragrafo.matchAll(TRECHO)) trechos.push(desescapar(m[2]));
  const completo = trechos.join('');
  if (!completo.includes('{{')) return paragrafo;

  // Dono de cada caractere do texto completo (índice do trecho <w:t>).
  const dono = [];
  trechos.forEach((t, i) => {
    for (let k = 0; k < t.length; k++) dono.push(i);
  });

  const substituicoes = new Map();
  for (const m of completo.matchAll(CAMPO)) {
    if (Object.prototype.hasOwnProperty.call(campos, m[1])) {
      substituicoes.set(m.index, { fim: m.index + m[0].length, valor: String(campos[m[1]] ?? '') });
    }
  }
  if (substituicoes.size === 0) return paragrafo;

  // O valor entra no trecho onde o campo começa; o resto do campo some dos outros trechos.
  const novos = trechos.map(() => '');
  for (let i = 0; i < completo.length; ) {
    const s = substituicoes.get(i);
    if (s) {
      novos[dono[i]] += s.valor.replace(/\r?\n/g, ' ');
      i = s.fim;
    } else {
      novos[dono[i]] += completo[i];
      i++;
    }
  }

  let indice = 0;
  return paragrafo.replace(TRECHO, (_, atributos = '', original) => {
    const texto = novos[indice++];
    if (texto === desescapar(original)) return `<w:t${atributos}>${original}</w:t>`;
    const preservar = /xml:space=/.test(atributos) ? atributos : `${atributos} xml:space="preserve"`;
    return `<w:t${preservar}>${escapar(texto)}</w:t>`;
  });
}

function mesclarXmlWord(xml, campos) {
  return xml.replace(PARAGRAFO, (p) => mesclarParagrafo(p, campos));
}

/** Partes do .docx que podem conter campos. */
function ehParteComTexto(caminho) {
  return /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(caminho);
}

module.exports = { mesclarXmlWord, ehParteComTexto };
