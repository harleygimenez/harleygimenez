const enviado = $input.first().json;
return [{
  json: {
    resposta: {
      arquivo: {
        id: enviado.id,
        nome: enviado.name,
        url: enviado.webUrl,
        mimeType: enviado.file?.mimeType ?? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    },
  },
}];
