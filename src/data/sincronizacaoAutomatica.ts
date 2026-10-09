import { useEffect } from 'react';
import { AppState } from 'react-native';

import { COLECOES } from './mesclagemDados';
import { useNuvem } from './nuvem';
import { useDados } from './store';

const ESPERA_MS = 4000;

function sincronizarSePossivel() {
  const { escritorio, sessao } = useNuvem.getState();
  if (escritorio && sessao) void useNuvem.getState().sincronizar().catch(() => undefined);
}

function quandoHidratado(acao: () => void): () => void {
  if (useNuvem.persist.hasHydrated()) {
    acao();
    return () => undefined;
  }
  return useNuvem.persist.onFinishHydration(acao);
}

/**
 * Com login e escritório escolhidos: entra na sessão ao abrir o app, sincroniza ao voltar
 * para o app e alguns segundos depois de cada alteração nos dados.
 */
export function useSincronizacaoAutomatica() {
  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | undefined;
    const cancelarHidratacao = quandoHidratado(() => {
      void useNuvem.getState().iniciar().then(sincronizarSePossivel);
    });
    const cancelarDados = useDados.subscribe((atual, anterior) => {
      if (!COLECOES.some((c) => atual[c] !== anterior[c])) return;
      clearTimeout(espera);
      espera = setTimeout(sincronizarSePossivel, ESPERA_MS);
    });
    const assinaturaApp = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') sincronizarSePossivel();
    });
    return () => {
      cancelarHidratacao();
      cancelarDados();
      assinaturaApp.remove();
      clearTimeout(espera);
    };
  }, []);
}
