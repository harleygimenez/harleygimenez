const arquivos = ($input.first().json.files ?? []).map((f) => ({
  id: f.id,
  nome: f.name,
  url: f.webViewLink,
  mimeType: f.mimeType,
  modificadoEm: f.modifiedTime,
}));
return [{ json: { resposta: { arquivos } } }];
