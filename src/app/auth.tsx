import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { estilos } from '../components/ui';
import { cores } from '../tema';

// Na web, fecha a janela de login e devolve o endereço para quem a abriu.
WebBrowser.maybeCompleteAuthSession();

/** Retorno do login com Google/Microsoft (openjus://auth). */
export default function RetornoDoLogin() {
  useEffect(() => {
    const tempo = setTimeout(() => router.replace('/conta'), 800);
    return () => clearTimeout(tempo);
  }, []);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: cores.fundo }}>
      <ActivityIndicator color={cores.primaria} />
      <Text style={estilos.textoSuave}>Concluindo o login…</Text>
    </View>
  );
}
