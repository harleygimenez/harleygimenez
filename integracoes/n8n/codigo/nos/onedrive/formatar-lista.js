const arquivos = ($input.first().json.value ?? [])
  .filter((f) => !f.folder)
  .sort((a, b) => String(b.lastModifiedDateTime).localeCompare(String(a.lastModifiedDateTime)))
  .slice(0, 50)
  .map((f) => ({
    id: f.id,
    nome: f.name,
    url: f.webUrl,
    mimeType: f.file?.mimeType ?? '',
    modificadoEm: f.lastModifiedDateTime,
  }));
return [{ json: { resposta: { arquivos } } }];
