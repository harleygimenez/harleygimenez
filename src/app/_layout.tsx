import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSyncExternalStore } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useDados } from '../data/store';
import { cores } from '../tema';

const assinarHidratacao = (aoMudar: () => void) => useDados.persist.onFinishHydration(aoMudar);
const estaHidratado = () => useDados.persist.hasHydrated();

function useHidratado() {
  return useSyncExternalStore(assinarHidratacao, estaHidratado, estaHidratado);
}

const formulario = { presentation: 'modal' } as const;

export default function Raiz() {
  const hidratado = useHidratado();

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {hidratado ? (
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: cores.primaria },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '700' },
            contentStyle: { backgroundColor: cores.fundo },
            headerBackButtonDisplayMode: 'minimal',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="processo/[id]" options={{ title: 'Processo' }} />
          <Stack.Screen name="cliente/[id]" options={{ title: 'Cliente' }} />
          <Stack.Screen name="processo/form" options={formulario} />
          <Stack.Screen name="cliente/form" options={formulario} />
          <Stack.Screen name="compromisso/form" options={formulario} />
          <Stack.Screen name="lancamento/form" options={formulario} />
          <Stack.Screen name="andamento/form" options={formulario} />
          <Stack.Screen name="atendimento/form" options={formulario} />
          <Stack.Screen name="calculadora" options={{ title: 'Calculadora de prazos' }} />
          <Stack.Screen name="ajustes" options={{ title: 'Ajustes' }} />
          <Stack.Screen name="integracoes" options={{ title: 'Integrações' }} />
          <Stack.Screen name="modelos" options={{ title: 'Modelos de documentos' }} />
          <Stack.Screen name="modelo/form" options={formulario} />
          <Stack.Screen name="documento/gerar" options={formulario} />
          <Stack.Screen name="documento/importar" options={formulario} />
        </Stack>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: cores.fundo }}>
          <ActivityIndicator color={cores.primaria} />
        </View>
      )}
    </SafeAreaProvider>
  );
}
