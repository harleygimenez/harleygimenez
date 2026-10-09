import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useSincronizacaoAutomatica } from '../data/sincronizacaoAutomatica';
import { useDados } from '../data/store';
import { cores } from '../tema';

const assinarHidratacao = (aoMudar: () => void) => useDados.persist.onFinishHydration(aoMudar);
const estaHidratado = () => useDados.persist.hasHydrated();

function useHidratado() {
  const dados = useSyncExternalStore(assinarHidratacao, estaHidratado, estaHidratado);
  const segredos = useDados((s) => s.segredosCarregados);
  return dados && segredos;
}

/** Erro inesperado: mensagem amigável, sem expor detalhes técnicos (stack trace) fora do modo de desenvolvimento. */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  if (__DEV__) console.error(error);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: cores.fundo }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: cores.texto }}>Algo deu errado</Text>
      <Text style={{ fontSize: 14, color: cores.textoSuave, textAlign: 'center' }}>
        Seus dados continuam salvos no aparelho. Tente de novo.
      </Text>
      {__DEV__ && <Text style={{ fontSize: 12, color: cores.perigo }}>{error.message}</Text>}
      <Pressable onPress={retry} style={{ backgroundColor: cores.primaria, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10 }}>
        <Text style={{ color: '#fff', fontWeight: '600' }}>Tentar de novo</Text>
      </Pressable>
    </View>
  );
}

const formulario = { presentation: 'modal' } as const;

export default function Raiz() {
  const hidratado = useHidratado();
  useSincronizacaoAutomatica();

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
          <Stack.Screen name="publicacoes" options={{ title: 'Publicações no Diário' }} />
          <Stack.Screen name="equipe" options={{ title: 'Equipe do escritório' }} />
          <Stack.Screen name="conta" options={{ title: 'Conta e escritório' }} />
          <Stack.Screen name="auth" options={{ headerShown: false }} />
        </Stack>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: cores.fundo }}>
          <ActivityIndicator color={cores.primaria} />
        </View>
      )}
    </SafeAreaProvider>
  );
}
