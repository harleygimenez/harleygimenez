import { Alert, Platform } from 'react-native';

/** Alert.alert não exibe nada na web, então lá usamos o confirm do navegador. */
export function confirmar(titulo: string, mensagem: string, aoConfirmar: () => void, rotulo = 'Excluir') {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${titulo}\n\n${mensagem}`)) aoConfirmar();
    return;
  }
  Alert.alert(titulo, mensagem, [
    { text: 'Cancelar', style: 'cancel' },
    { text: rotulo, style: 'destructive', onPress: aoConfirmar },
  ]);
}

export function avisar(titulo: string, mensagem: string) {
  if (Platform.OS === 'web') {
    globalThis.alert?.(`${titulo}\n\n${mensagem}`);
    return;
  }
  Alert.alert(titulo, mensagem);
}
