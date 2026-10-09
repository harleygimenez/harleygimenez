import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { confirmar } from '../lib/confirmar';
import { cores, espaco } from '../tema';
import { Botao } from './ui';

export function Formulario({
  titulo,
  aoSalvar,
  exclusao,
  children,
}: {
  titulo: string;
  aoSalvar: () => void;
  /** Presente apenas na edição. */
  exclusao?: { pergunta: string; aoExcluir: () => void };
  children: ReactNode;
}) {
  const margens = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: cores.fundo }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: titulo }} />
      <ScrollView contentContainerStyle={s.conteudo} keyboardShouldPersistTaps="handled">
        {children}
        {exclusao && (
          <Botao
            titulo="Excluir"
            icone="trash-outline"
            variante="perigo"
            aoPressionar={() => confirmar('Excluir?', exclusao.pergunta, exclusao.aoExcluir)}
          />
        )}
      </ScrollView>
      <View style={[s.rodape, { paddingBottom: Math.max(margens.bottom, espaco.md) }]}>
        <Botao titulo="Salvar" icone="checkmark" aoPressionar={aoSalvar} />
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  conteudo: { padding: espaco.lg, gap: espaco.lg, paddingBottom: espaco.xl },
  rodape: {
    paddingHorizontal: espaco.lg,
    paddingTop: espaco.md,
    backgroundColor: cores.superficie,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
  },
});
