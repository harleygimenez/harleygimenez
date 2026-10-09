import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { conexaoVazia, gerarId, useDados } from '../../data/store';
import { gerarDocumento, listarArquivos } from '../n8n';
import { ehLinkSeguro, validarUrlWebhook } from '../urls';

const cofre = (SecureStore as unknown as { __cofre: Map<string, string> }).__cofre;
const esperar = () => new Promise((r) => setTimeout(r, 0));

describe('tokens fora do armazenamento comum (itens 7 e 8)', () => {
  it('guarda o token no cofre seguro e nunca no AsyncStorage/localStorage', async () => {
    useDados.getState().salvarIntegracao({
      google: { ...conexaoVazia, webhookUrl: 'https://n8n.exemplo.com/webhook/openjus', token: 'segredo-google-123' },
      onedrive: { ...conexaoVazia, token: 'segredo-onedrive-456' },
      chaveDataJud: '',
    });
    await esperar();
    const salvo = (await AsyncStorage.getItem('openjus-dados')) ?? '';
    expect(salvo).toContain('n8n.exemplo.com');
    expect(salvo).not.toContain('segredo-google-123');
    expect(salvo).not.toContain('segredo-onedrive-456');
    expect(cofre.get('openjus.token.google')).toBe('segredo-google-123');
    expect(cofre.get('openjus.token.onedrive')).toBe('segredo-onedrive-456');
    expect(useDados.getState().integracao.google.token).toBe('segredo-google-123');
  });

  it('move tokens salvos por versões antigas para o cofre e os apaga do armazenamento comum', async () => {
    cofre.clear();
    const antigo = {
      state: {
        iniciado: true,
        integracao: {
          google: { ...conexaoVazia, webhookUrl: 'https://n8n/webhook/openjus', token: 'token-legado' },
          onedrive: conexaoVazia,
          chaveDataJud: '',
        },
      },
      version: 3,
    };
    await AsyncStorage.setItem('openjus-dados', JSON.stringify(antigo));
    await useDados.persist.rehydrate();
    await esperar();
    await esperar();
    expect(cofre.get('openjus.token.google')).toBe('token-legado');
    expect(useDados.getState().integracao.google.token).toBe('token-legado');
    expect(useDados.getState().segredosCarregados).toBe(true);
    expect(await AsyncStorage.getItem('openjus-dados')).not.toContain('token-legado');
  });
});

describe('IDs não previsíveis (item 11)', () => {
  it('gera UUID v4 aleatório', () => {
    const ids = new Set(Array.from({ length: 200 }, gerarId));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('URLs (itens 6, 9 e 12)', () => {
  it('exige https no webhook, salvo na rede local', () => {
    expect(validarUrlWebhook('https://n8n.escritorio.com.br/webhook/openjus')).toBeNull();
    expect(validarUrlWebhook('http://n8n.escritorio.com.br/webhook/openjus')).toMatch('sem criptografia');
    expect(validarUrlWebhook('http://192.168.0.10:5678/webhook/openjus')).toBeNull();
    expect(validarUrlWebhook('http://localhost:5678/webhook/openjus')).toBeNull();
    expect(validarUrlWebhook('http://172.32.0.1/webhook')).toMatch('sem criptografia');
    expect(validarUrlWebhook('javascript:alert(1)')).toMatch('https://');
    expect(validarUrlWebhook('ftp://x')).toMatch('https://');
  });

  it('só considera seguros links https', () => {
    expect(ehLinkSeguro('https://docs.google.com/document/d/abc/edit')).toBe(true);
    expect(ehLinkSeguro('javascript:alert(document.cookie)')).toBe(false);
    expect(ehLinkSeguro('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(ehLinkSeguro('http://exemplo.com')).toBe(false);
    expect(ehLinkSeguro('https://')).toBe(false);
    expect(ehLinkSeguro(42)).toBe(false);
  });

  it('descarta itens maliciosos ou malformados vindos do n8n', async () => {
    const config = { ...conexaoVazia, webhookUrl: 'https://n8n/webhook/openjus', pastaDestinoId: 'pasta123456' };
    const resposta = (corpo: unknown) =>
      jest.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(corpo)) });
    const arquivos = await listarArquivos(config, {}, {
      fetch: resposta({
        arquivos: [
          { id: 'ok1', nome: 'Contrato.pdf', url: 'https://drive.google.com/file/d/ok1', mimeType: 'application/pdf' },
          { id: 'xss', nome: 'Clique', url: 'javascript:alert(1)' },
          { id: 7, nome: 'id numérico', url: 'https://x.com' },
          null,
        ],
      }),
    });
    expect(arquivos.map((a) => a.id)).toEqual(['ok1']);
    await expect(
      gerarDocumento(config, { modeloId: 'm', nomeArquivo: 'x', campos: {} }, {
        fetch: resposta({ arquivo: { id: 'a', nome: 'b', url: 'javascript:alert(1)' } }),
      }),
    ).rejects.toThrow('Resposta inesperada');
  });
});
