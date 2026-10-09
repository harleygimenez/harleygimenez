const copia = $('Copiar modelo').first().json;
return [{
  json: {
    resposta: {
      arquivo: {
        id: copia.id,
        nome: copia.name,
        url: copia.webViewLink || `https://docs.google.com/document/d/${copia.id}/edit`,
        mimeType: copia.mimeType || 'application/vnd.google-apps.document',
      },
    },
  },
}];
