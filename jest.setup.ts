jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Cofre seguro em memória (Keychain/Keystore não existem no Jest).
jest.mock('expo-secure-store', () => {
  const cofre = new Map<string, string>();
  return {
    __cofre: cofre,
    getItemAsync: jest.fn(async (k: string) => cofre.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void cofre.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void cofre.delete(k)),
  };
});

// O mock padrão do jest-expo devolve sempre o mesmo UUID; usa o gerador criptográfico do Node.
jest.mock('expo-crypto', () => {
  const nodeCrypto = require('node:crypto');
  return {
    randomUUID: () => nodeCrypto.randomUUID(),
    getRandomBytes: (n: number) => new Uint8Array(nodeCrypto.randomBytes(n)),
    digestStringAsync: async (_algoritmo: string, dados: string, opcoes?: { encoding?: string }) =>
      nodeCrypto.createHash('sha256').update(dados).digest(opcoes?.encoding === 'base64' ? 'base64' : 'hex'),
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    CryptoEncoding: { HEX: 'hex', BASE64: 'base64' },
  };
});

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
  maybeCompleteAuthSession: jest.fn(),
}));

jest.mock('expo-linking', () => ({ createURL: (caminho: string) => `openjus://${caminho}` }));
