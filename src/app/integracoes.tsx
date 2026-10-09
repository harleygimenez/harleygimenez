import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Botao, Campo, Cartao, Secao, Tela, estilos } from '../components/ui';
import { useDados } from '../data/store';
import { extrairIdGoogle } from '../lib/google';
import { mascararTelefone } from '../lib/formatos';
import { CABECALHO_TOKEN, testarConexao } from '../lib/n8n';
import { cores, espaco, raio } from '../tema';

type Teste = { estado: 'ok' | 'erro'; mensagem: string } | null;

export default function Integracoes() {
  const integracao = useDados((s) => s.integracao);
  const perfil = useDados((s) => s.perfil);
  const salvarIntegracao = useDados((s) => s.salvarIntegracao);
  const salvarPerfil = useDados((s) => s.salvarPerfil);

  const [webhookUrl, setWebhookUrl] = useState(integracao.webhookUrl);
  const [token, setToken] = useState(integracao.token);
  const [pastaDestino, setPastaDestino] = useState(integracao.pastaDestinoId);
  const [pastaImportacao, setPastaImportacao] = useState(integracao.pastaImportacaoId);
  const [nome, setNome] = useState(perfil.nome);
  const [oab, setOab] = useState(perfil.oab);
  const [email, setEmail] = useState(perfil.email);
  const [telefone, setTelefone] = useState(perfil.telefone);
  const [cidade, setCidade] = useState(perfil.cidade);
  const [testando, setTestando] = useState(false);
  const [teste, setTeste] = useState<Teste>(null);

  const pastaDestinoId = extrairIdGoogle(pastaDestino);
  const pastaImportacaoId = extrairIdGoogle(pastaImportacao);
  const atual = {
    webhookUrl: webhookUrl.trim(),
    token: token.trim(),
    pastaDestinoId,
    pastaImportacaoId,
  };

  async function testar() {
    setTestando(true);
    setTeste(null);
    try {
      const { versao } = await testarConexao(atual);
      setTeste({ estado: 'ok', mensagem: `Conectado ao workflow do n8n (versão ${versao}).` });
    } catch (e) {
      setTeste({ estado: 'erro', mensagem: (e as Error).message });
    } finally {
      setTestando(false);
    }
  }

  function salvar() {
    salvarIntegracao(atual);
    salvarPerfil({ nome: nome.trim(), oab: oab.trim(), email: email.trim(), telefone, cidade: cidade.trim() });
    router.back();
  }

  return (
    <Tela
      rodape={
        <View style={s.rodape}>
          <Botao titulo="Salvar" icone="checkmark" aoPressionar={salvar} />
        </View>
      }
    >
      <Text style={estilos.textoSuave}>
        O app fala com o Google Drive e o Google Docs por um workflow do n8n. Suas credenciais do Google ficam só no
        n8n. Importe o arquivo integracoes/n8n/causa-google-drive.json do repositório no seu n8n e siga o guia que
        está na mesma pasta.
      </Text>

      <Secao titulo="Webhook do n8n">
        <Campo
          rotulo="URL de produção do webhook"
          value={webhookUrl}
          onChangeText={setWebhookUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://seu-n8n.com/webhook/causa"
        />
        <Campo
          rotulo="Token"
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          dica={`Mesmo valor da credencial "Header Auth" do n8n, com o nome ${CABECALHO_TOKEN}.`}
        />
        <Botao
          titulo="Testar conexão"
          icone="pulse-outline"
          variante="secundario"
          desabilitado={testando}
          aoPressionar={testar}
        />
        {testando && <ActivityIndicator color={cores.primaria} />}
        {teste && (
          <View style={[s.resultado, { backgroundColor: teste.estado === 'ok' ? cores.sucessoClaro : cores.perigoClaro }]}>
            <Ionicons
              name={teste.estado === 'ok' ? 'checkmark-circle' : 'alert-circle'}
              size={20}
              color={teste.estado === 'ok' ? cores.sucesso : cores.perigo}
            />
            <Text style={{ flex: 1, color: teste.estado === 'ok' ? cores.sucesso : cores.perigo }}>{teste.mensagem}</Text>
          </View>
        )}
      </Secao>

      <Secao titulo="Pastas do Google Drive">
        <Campo
          rotulo="Pasta para documentos gerados"
          value={pastaDestino}
          onChangeText={setPastaDestino}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Link da pasta no Drive"
          dica={pastaDestinoId ? `ID da pasta: ${pastaDestinoId}` : 'Abra a pasta no Drive e copie o link do navegador.'}
          erro={pastaDestino && !pastaDestinoId ? 'Link de pasta não reconhecido.' : undefined}
        />
        <Campo
          rotulo="Pasta padrão para importar (opcional)"
          value={pastaImportacao}
          onChangeText={setPastaImportacao}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Vazio = buscar em todo o Drive"
          dica={pastaImportacaoId ? `ID da pasta: ${pastaImportacaoId}` : undefined}
          erro={pastaImportacao && !pastaImportacaoId ? 'Link de pasta não reconhecido.' : undefined}
        />
      </Secao>

      <Secao titulo="Seus dados nos documentos">
        <Cartao estilo={{ gap: espaco.md }}>
          <Campo rotulo="Nome" value={nome} onChangeText={setNome} placeholder="{{advogado.nome}}" />
          <Campo rotulo="OAB" value={oab} onChangeText={setOab} placeholder="Ex.: OAB/SP 123.456" />
          <Campo
            rotulo="E-mail"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Campo
            rotulo="Telefone"
            value={telefone}
            onChangeText={(t) => setTelefone(mascararTelefone(t))}
            keyboardType="phone-pad"
          />
          <Campo rotulo="Cidade" value={cidade} onChangeText={setCidade} placeholder="Ex.: São Paulo/SP" />
        </Cartao>
      </Secao>

      <Botao titulo="Modelos de documentos" icone="documents-outline" variante="texto" aoPressionar={() => router.push('/modelos')} />
    </Tela>
  );
}

const s = StyleSheet.create({
  resultado: { flexDirection: 'row', gap: espaco.sm, alignItems: 'center', padding: espaco.md, borderRadius: raio.md },
  rodape: { padding: espaco.lg, backgroundColor: cores.superficie, borderTopWidth: 1, borderTopColor: cores.borda },
});
