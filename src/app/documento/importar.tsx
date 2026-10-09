import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AvisoIntegracao } from '../../components/Documentos';
import { Botao, Busca, Cartao, Seletor, Tela, Vazio, estilos } from '../../components/ui';
import { useDados } from '../../data/store';
import { formatarData } from '../../lib/datas';
import { descreverTipoArquivo } from '../../lib/google';
import { listarArquivos, validarIntegracao, type ArquivoDrive } from '../../lib/n8n';
import { cores, espaco, raio } from '../../tema';

type Escopo = 'pasta' | 'tudo';

export default function ImportarDoDrive() {
  const params = useLocalSearchParams<{ processoId?: string; clienteId?: string }>();
  const integracao = useDados((s) => s.integracao);
  const processo = useDados((s) => s.processos.find((p) => p.id === params.processoId));
  const jaVinculados = useDados((s) => s.documentos);
  const salvarDocumento = useDados((s) => s.salvarDocumento);

  const [busca, setBusca] = useState('');
  const [escopo, setEscopo] = useState<Escopo>(integracao.pastaImportacaoId ? 'pasta' : 'tudo');
  const [arquivos, setArquivos] = useState<ArquivoDrive[] | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  const processoId = params.processoId;
  const clienteId = params.clienteId ?? processo?.clienteId;
  const vinculados = new Set(
    jaVinculados
      .filter((d) => (processoId ? d.processoId === processoId : d.clienteId === clienteId))
      .map((d) => d.driveId),
  );

  async function pesquisar() {
    setErro('');
    setCarregando(true);
    try {
      const pastaId = escopo === 'pasta' ? integracao.pastaImportacaoId : '';
      setArquivos(await listarArquivos(integracao, { busca, pastaId }));
      setSelecionados(new Set());
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  function alternar(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function vincular() {
    const agora = new Date().toISOString();
    for (const arquivo of arquivos ?? []) {
      if (!selecionados.has(arquivo.id)) continue;
      salvarDocumento({
        nome: arquivo.nome,
        driveId: arquivo.id,
        url: arquivo.url,
        mimeType: arquivo.mimeType,
        origem: 'drive',
        processoId,
        clienteId,
        criadoEm: agora,
      });
    }
    router.back();
  }

  const integracaoInvalida = validarIntegracao(integracao);

  return (
    <Tela
      rodape={
        selecionados.size > 0 ? (
          <View style={s.rodape}>
            <Botao
              titulo={`Vincular ${selecionados.size} ${selecionados.size === 1 ? 'arquivo' : 'arquivos'}`}
              icone="link-outline"
              aoPressionar={vincular}
            />
          </View>
        ) : undefined
      }
    >
      <Stack.Screen options={{ title: 'Importar do Google Drive' }} />
      {integracaoInvalida && <AvisoIntegracao />}

      <Busca valor={busca} aoMudar={setBusca} placeholder="Nome do arquivo (opcional)" />
      {!!integracao.pastaImportacaoId && (
        <Seletor<Escopo>
          opcoes={[
            { valor: 'pasta', rotulo: 'Pasta padrão' },
            { valor: 'tudo', rotulo: 'Todo o Drive' },
          ]}
          valor={escopo}
          aoMudar={setEscopo}
        />
      )}
      <Botao
        titulo="Buscar no Drive"
        icone="search"
        variante="secundario"
        desabilitado={carregando || !!integracaoInvalida}
        aoPressionar={pesquisar}
      />

      {!!erro && (
        <View style={s.erro}>
          <Ionicons name="alert-circle" size={20} color={cores.perigo} />
          <Text style={{ color: cores.perigo, flex: 1 }}>{erro}</Text>
        </View>
      )}

      {carregando && <ActivityIndicator color={cores.primaria} />}

      {arquivos && !carregando && arquivos.length === 0 && (
        <Vazio icone="cloud-offline-outline" titulo="Nenhum arquivo encontrado" texto="Tente outro nome ou busque em todo o Drive." />
      )}

      {arquivos?.map((arquivo) => {
        const jaTem = vinculados.has(arquivo.id);
        const marcado = selecionados.has(arquivo.id);
        return (
          <Pressable key={arquivo.id} disabled={jaTem} onPress={() => alternar(arquivo.id)}>
            <Cartao estilo={[s.arquivo, marcado && { borderColor: cores.primaria }, jaTem && { opacity: 0.55 }]}>
              <Ionicons
                name={jaTem ? 'checkmark-done' : marcado ? 'checkbox' : 'square-outline'}
                size={22}
                color={marcado || jaTem ? cores.primaria : cores.textoFraco}
              />
              <View style={{ flex: 1 }}>
                <Text style={estilos.titulo} numberOfLines={2}>
                  {arquivo.nome}
                </Text>
                <Text style={estilos.textoSuave}>
                  {descreverTipoArquivo(arquivo.mimeType)}
                  {arquivo.modificadoEm ? ` · alterado em ${formatarData(arquivo.modificadoEm.slice(0, 10))}` : ''}
                  {jaTem ? ' · já vinculado' : ''}
                </Text>
              </View>
            </Cartao>
          </Pressable>
        );
      })}
    </Tela>
  );
}

const s = StyleSheet.create({
  arquivo: { flexDirection: 'row', alignItems: 'center', gap: espaco.md },
  erro: { flexDirection: 'row', gap: espaco.sm, backgroundColor: cores.perigoClaro, padding: espaco.md, borderRadius: raio.md },
  rodape: {
    padding: espaco.lg,
    backgroundColor: cores.superficie,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
  },
});
