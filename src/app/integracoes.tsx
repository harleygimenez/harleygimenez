import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Botao, Campo, Cartao, Secao, Tela, estilos } from '../components/ui';
import { useDados } from '../data/store';
import { PROVEDORES, type Conexao, type Provedor } from '../data/types';
import { identificarArquivo } from '../lib/armazenamento';
import { CHAVE_PUBLICA_DATAJUD } from '../lib/datajud';
import { mascararTelefone } from '../lib/formatos';
import { CABECALHO_TOKEN, testarConexao } from '../lib/n8n';
import { cores, espaco, raio } from '../tema';

type Teste = { estado: 'ok' | 'erro'; mensagem: string } | null;

/** Campos digitados; as pastas viram ID (Google) ou caminho (OneDrive) ao salvar. */
type Rascunho = Conexao;

const TEXTOS: Record<Provedor, { arquivo: string; pastaDestino: string; pastaImportacao: string; dicaPasta: string }> = {
  google: {
    arquivo: 'openjus-google-drive.json',
    pastaDestino: 'Link da pasta no Google Drive',
    pastaImportacao: 'Vazio = buscar em todo o Drive',
    dicaPasta: 'Abra a pasta no Drive e copie o link do navegador.',
  },
  onedrive: {
    arquivo: 'openjus-onedrive.json',
    pastaDestino: '/OpenJus/Documentos',
    pastaImportacao: 'Vazio = raiz do OneDrive',
    dicaPasta: 'Caminho a partir da raiz do seu OneDrive.',
  },
};

function resolver(provedor: Provedor, r: Rascunho): Conexao {
  return {
    webhookUrl: r.webhookUrl.trim(),
    token: r.token.trim(),
    pastaDestinoId: identificarArquivo(provedor, r.pastaDestinoId),
    pastaImportacaoId: identificarArquivo(provedor, r.pastaImportacaoId),
  };
}

function SecaoConexao({
  provedor,
  valor,
  aoMudar,
}: {
  provedor: Provedor;
  valor: Rascunho;
  aoMudar: (r: Rascunho) => void;
}) {
  const [testando, setTestando] = useState(false);
  const [teste, setTeste] = useState<Teste>(null);
  const textos = TEXTOS[provedor];
  const conexao = resolver(provedor, valor);
  const muda = (campo: keyof Rascunho) => (texto: string) => {
    aoMudar({ ...valor, [campo]: texto });
    setTeste(null);
  };

  async function testar() {
    setTestando(true);
    setTeste(null);
    try {
      const { versao } = await testarConexao(conexao);
      setTeste({ estado: 'ok', mensagem: `Conectado ao workflow do n8n (versão ${versao}).` });
    } catch (e) {
      setTeste({ estado: 'erro', mensagem: (e as Error).message });
    } finally {
      setTestando(false);
    }
  }

  const pastaInvalida = (texto: string, id: string) =>
    texto.trim() && !id ? (provedor === 'google' ? 'Link de pasta não reconhecido.' : 'Caminho inválido.') : undefined;

  return (
    <Secao titulo={PROVEDORES[provedor].nome}>
      <Cartao estilo={{ gap: espaco.md }}>
        <Text style={estilos.textoSuave}>
          Importe integracoes/n8n/{textos.arquivo} no seu n8n e siga o guia da mesma pasta.
        </Text>
        <Campo
          rotulo="URL de produção do webhook"
          value={valor.webhookUrl}
          onChangeText={muda('webhookUrl')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder={`https://seu-n8n.com/webhook/${provedor === 'google' ? 'openjus' : 'openjus-onedrive'}`}
        />
        <Campo
          rotulo="Token"
          value={valor.token}
          onChangeText={muda('token')}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          dica={`Mesmo valor da credencial "Header Auth" do n8n, com o nome ${CABECALHO_TOKEN}.`}
        />
        <Campo
          rotulo="Pasta para documentos gerados"
          value={valor.pastaDestinoId}
          onChangeText={muda('pastaDestinoId')}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={textos.pastaDestino}
          dica={
            conexao.pastaDestinoId && conexao.pastaDestinoId !== valor.pastaDestinoId.trim()
              ? `${provedor === 'google' ? 'ID' : 'Caminho'}: ${conexao.pastaDestinoId}`
              : textos.dicaPasta
          }
          erro={pastaInvalida(valor.pastaDestinoId, conexao.pastaDestinoId)}
        />
        <Campo
          rotulo="Pasta padrão para importar (opcional)"
          value={valor.pastaImportacaoId}
          onChangeText={muda('pastaImportacaoId')}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={textos.pastaImportacao}
          erro={pastaInvalida(valor.pastaImportacaoId, conexao.pastaImportacaoId)}
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
      </Cartao>
    </Secao>
  );
}

export default function Integracoes() {
  const integracao = useDados((s) => s.integracao);
  const perfil = useDados((s) => s.perfil);
  const salvarIntegracao = useDados((s) => s.salvarIntegracao);
  const salvarPerfil = useDados((s) => s.salvarPerfil);

  const [google, setGoogle] = useState<Rascunho>(integracao.google);
  const [onedrive, setOnedrive] = useState<Rascunho>(integracao.onedrive);
  const [chaveDataJud, setChaveDataJud] = useState(integracao.chaveDataJud);
  const [nome, setNome] = useState(perfil.nome);
  const [oab, setOab] = useState(perfil.oab);
  const [email, setEmail] = useState(perfil.email);
  const [telefone, setTelefone] = useState(perfil.telefone);
  const [cidade, setCidade] = useState(perfil.cidade);

  function salvar() {
    salvarIntegracao({
      google: resolver('google', google),
      onedrive: resolver('onedrive', onedrive),
      chaveDataJud: chaveDataJud.trim(),
    });
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
        O app acessa o Google Drive e o OneDrive por workflows do n8n. As credenciais do Google e da Microsoft ficam só
        no n8n. Configure um ou os dois.
      </Text>

      <SecaoConexao provedor="google" valor={google} aoMudar={setGoogle} />
      <SecaoConexao provedor="onedrive" valor={onedrive} aoMudar={setOnedrive} />

      <Secao titulo="DataJud (CNJ)">
        <Cartao estilo={{ gap: espaco.md }}>
          <Text style={estilos.textoSuave}>
            Os andamentos dos processos vêm da API pública do DataJud. Ela usa uma chave pública divulgada pelo CNJ, já
            configurada. Se o CNJ trocar a chave, cole a nova aqui.
          </Text>
          <Campo
            rotulo="Chave da API pública (opcional)"
            value={chaveDataJud}
            onChangeText={setChaveDataJud}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={`Padrão: ${CHAVE_PUBLICA_DATAJUD.slice(0, 12)}…`}
          />
        </Cartao>
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
