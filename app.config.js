// Completa o app.json com o número do build (OPENJUS_BUILD, definido no GitHub Actions).
// Cada APK de teste ganha um versionCode maior, então o Android atualiza por cima do anterior,
// e o número aparece no rodapé de Ajustes para conferir qual versão está instalada.
module.exports = ({ config }) => {
  const build = Number.parseInt(process.env.OPENJUS_BUILD ?? '', 10);
  return {
    ...config,
    android: { ...config.android, ...(Number.isFinite(build) && build > 0 ? { versionCode: build } : {}) },
    extra: { ...config.extra, build: Number.isFinite(build) && build > 0 ? String(build) : 'local' },
  };
};
