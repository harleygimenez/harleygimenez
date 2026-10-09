import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { abrirDocumento, AvisoIntegracao } from '../../components/Documentos';
import { Botao, Campo, Cartao, Secao, Seletor, SeletorRegistro, Tela, Vazio, estilos } from '../../components/ui';
import { useDados } from '../../data/store';
import { hojeISO } from '../../lib/datas';
import { camposDeMesclagem, nomeArquivoPadrao } from '../../lib/mesclagem';
import { gerarDocumento, validarIntegracao, type ArquivoDrive } from '../../lib/n8n';
import { cores, espaco, raio } from '../../tema';

export default function GerarDocumento() {
  const params = useLocalSearchParams<{ processoId?: string; clienteId?: string }>();
  const modelos = useDados((s) => s.modelos);
  const processos = useDados((s) => s.processos);
  const clientes = useDados((s) => s.clientes);
  const perfil = useDados((s) => s.perfil);
  const integracao = useDados((s) => s.integracao);
  const salvarDocumento = useDados((s) => s.salvarDocumento);

  const [modeloId, setModeloId] = useState(modelos[0]?.id ?? '');
  const [processoId, setProcessoId] = useState(params.processoId);
  const [clienteId, setClienteId] = useState(
    params.clienteId ?? processos.find((p) => p.id === params.processoId)?.clienteId,
  );
  const [nomeEditado, setNomeEditado] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState('');
  const [gerado, setGerado] = useState<ArquivoDrive | null>(null);

  const hoje = hojeISO();
  const modelo = modelos.find((m) => m.id === modeloId);
  const processo = processos.find((p) => p.id === processoId);
  const cliente = clientes.find((c) => c.id === clienteId);
  const campos = camposDeMesclagem({ cliente, processo, perfil, hoje });
  const vazios = Object.entries(campos).filter(([, v]) => !v).map(([k]) => k);
  const nomeArquivo = nomeEditado ?? (modelo ? nomeArquivoPadrao(modelo, cliente, hoje) : '');

  function escolherProcesso(id: string | undefined) {
    setProcessoId(id);
    const doProcesso = processos.find((p) => p.id === id)?.clienteId;
    if (doProcesso) setClienteId(doProcesso);
  }

  async function gerar() {
    if (!modelo) return;
    setErro('');
    setGerando(true);
    try {
      const arquivo = await gerarDocumento(integracao, {
        modeloId: modelo.googleDocId,
        nomeArquivo: nomeArquivo.trim() || modelo.nome,
        campos,
      });
      salvarDocumento({
        nome: arquivo.nome,
        driveId: arquivo.id,
        url: arquivo.url,
        mimeType: arquivo.mimeType,
        origem: 'gerado',
        processoId,
        clienteId,
        modeloId: modelo.id,
        criadoEm: new Date().toISOString(),
      });
      setGerado(arquivo);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setGerando(false);
    }
  }

  if (gerado) {
    return (
      <Tela>
        <Stack.Screen options={{ title: 'Documento gerado' }} />
        <View style={s.sucesso}>
          <Ionicons name="checkmark-circle" size={56} color={cores.sucesso} />
          <Text style={[estilos.titulo, { textAlign: 'center' }]}>{gerado.nome}</Text>
          <Text style={[estilos.textoSuave, { textAlign: 'center' }]}>
            Salvo na pasta do Google Drive e vinculado {processo ? 'ao processo' : 'ao cliente'}.
          </Text>
        </View>
        <Botao titulo="Abrir no Google Docs" icone="open-outline" aoPressionar={() => abrirDocumento(gerado)} />
        <Botao titulo="Concluir" variante="secundario" aoPressionar={() => router.back()} />
      </Tela>
    );
  }

  return (
    <Tela>
      <Stack.Screen options={{ title: 'Gerar documento' }} />
      {validarIntegracao(integracao) && <AvisoIntegracao />}

      {modelos.length === 0 ? (
        <Cartao estilo={{ gap: espaco.md }}>
          <Vazio
            icone="documents-outline"
            titulo="Nenhum modelo cadastrado"
            texto="Cadastre um documento do Google Docs com campos como {{cliente.nome}} para gerar documentos preenchidos."
          />
          <Botao titulo="Cadastrar modelo" icone="add" aoPressionar={() => router.push('/modelo/form')} />
        </Cartao>
      ) : (
        <>
          <Seletor
            rotulo="Modelo"
            opcoes={modelos.map((m) => ({ valor: m.id, rotulo: m.nome }))}
            valor={modeloId}
            aoMudar={(id) => {
              setModeloId(id);
              setNomeEditado(null);
            }}
          />
          <SeletorRegistro
            rotulo="Processo"
            itens={processos.map((p) => ({ id: p.id, titulo: p.titulo, subtitulo: p.numero || p.area }))}
            valor={processoId}
            aoMudar={escolherProcesso}
          />
          <SeletorRegistro
            rotulo="Cliente"
            itens={clientes.map((c) => ({ id: c.id, titulo: c.nome }))}
            valor={clienteId}
            aoMudar={setClienteId}
          />
          <Campo rotulo="Nome do arquivo" value={nomeArquivo} onChangeText={setNomeEditado} />

          <Secao titulo="Campos que serão preenchidos">
            <Cartao estilo={{ gap: espaco.sm }}>
              {Object.entries(campos)
                .filter(([, v]) => v)
                .map(([chave, valor]) => (
                  <View key={chave}>
                    <Text style={s.chave}>{`{{${chave}}}`}</Text>
                    <Text style={estilos.texto} numberOfLines={2}>
                      {valor}
                    </Text>
                  </View>
                ))}
              {vazios.length > 0 && (
                <Text style={[estilos.textoSuave, { marginTop: espaco.sm }]}>
                  Ficarão em branco: {vazios.map((v) => `{{${v}}}`).join(', ')}
                </Text>
              )}
            </Cartao>
          </Secao>

          {!!erro && (
            <View style={s.erro}>
              <Ionicons name="alert-circle" size={20} color={cores.perigo} />
              <Text style={{ color: cores.perigo, flex: 1 }}>{erro}</Text>
            </View>
          )}

          {gerando ? (
            <View style={s.carregando}>
              <ActivityIndicator color={cores.primaria} />
              <Text style={estilos.textoSuave}>Gerando no Google Docs…</Text>
            </View>
          ) : (
            <Botao
              titulo="Gerar e salvar no Drive"
              icone="cloud-upload-outline"
              desabilitado={!modelo || !!validarIntegracao(integracao)}
              aoPressionar={gerar}
            />
          )}
        </>
      )}
    </Tela>
  );
}

const s = StyleSheet.create({
  chave: { fontSize: 12, color: cores.primaria, fontFamily: 'monospace' },
  erro: { flexDirection: 'row', gap: espaco.sm, backgroundColor: cores.perigoClaro, padding: espaco.md, borderRadius: raio.md },
  carregando: { flexDirection: 'row', gap: espaco.sm, alignItems: 'center', justifyContent: 'center', padding: espaco.md },
  sucesso: { alignItems: 'center', gap: espaco.sm, paddingVertical: espaco.xl },
});
