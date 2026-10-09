// O nó Compression só abre arquivos com extensão .zip, e um .docx é um zip.
const item = $input.first();
item.binary.modelo.fileName = 'modelo.zip';
item.binary.modelo.fileExtension = 'zip';
item.binary.modelo.mimeType = 'application/zip';
return [item];
