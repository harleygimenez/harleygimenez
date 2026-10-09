import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { Provedor } from '../data/types';

/**
 * Tokens dos webhooks do n8n ficam fora do armazenamento comum do app
 * (AsyncStorage/localStorage, que é texto puro):
 * - Android/iOS: Keystore/Keychain via expo-secure-store.
 * - Web: só sessionStorage, apagado ao fechar a aba (o navegador não tem cofre seguro).
 */

export type Tokens = Record<Provedor, string>;

const chave = (provedor: Provedor) => `causa.token.${provedor}`;
const PROVEDORES: Provedor[] = ['google', 'onedrive'];

const web = {
  ler(nome: string): string | null {
    try {
      return globalThis.sessionStorage?.getItem(nome) ?? null;
    } catch {
      return null;
    }
  },
  gravar(nome: string, valor: string) {
    try {
      if (valor) globalThis.sessionStorage?.setItem(nome, valor);
      else globalThis.sessionStorage?.removeItem(nome);
    } catch {
      // Sem sessionStorage (modo privado restrito): o token fica só na memória.
    }
  },
};

export async function lerTokens(): Promise<Tokens> {
  const tokens = { google: '', onedrive: '' };
  for (const p of PROVEDORES) {
    tokens[p] = (Platform.OS === 'web' ? web.ler(chave(p)) : await SecureStore.getItemAsync(chave(p))) ?? '';
  }
  return tokens;
}

export async function guardarTokens(tokens: Tokens): Promise<void> {
  for (const p of PROVEDORES) {
    if (Platform.OS === 'web') web.gravar(chave(p), tokens[p]);
    else if (tokens[p]) await SecureStore.setItemAsync(chave(p), tokens[p]);
    else await SecureStore.deleteItemAsync(chave(p));
  }
}
