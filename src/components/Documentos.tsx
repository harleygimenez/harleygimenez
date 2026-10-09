import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { useDados } from '../data/store';
import { PROVEDORES, type Documento } from '../data/types';
import { avisar, confirmar } from '../lib/confirmar';
import { diaDoInstante, formatarData } from '../lib/datas';
import { descreverTipoArquivo } from '../lib/google';
import { cores, espaco } from '../tema';
import { Botao, BotaoIcone, Cartao, Secao, estilos } from './ui';

export async function abrirDocumento(documento: Pick<Documento, 'url' | 'nome'>) {
  try {
    await Linking.openURL(documento.url);
  } catch {
    avisar('Não foi possível abrir', `Abra o link manualmente:\n${documento.url}`);
  }
}

export function ItemDocumento({ documento }: { documento: Documento }) {
  const excluirDocumento = useDados((s) => s.excluirDocumento);
  const gerado = documento.origem === 'gerado';
  const google = documento.provedor === 'google';
  return (
    <Cartao estilo={s.item} aoPressionar={() => abrirDocumento(documento)}>
      <View style={[s.icone, { backgroundColor: google ? cores.sucessoClaro : cores.primariaClara }]}>
        <Ionicons
          name={gerado ? 'document-text-outline' : google ? 'logo-google' : 'logo-microsoft'}
          size={18}
          color={google ? cores.sucesso : cores.primaria}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={estilos.titulo} numberOfLines={2}>
          {documento.nome}
        </Text>
        <Text style={estilos.textoSuave}>
          {gerado ? 'Gerado de modelo' : descreverTipoArquivo(documento.mimeType)} · {PROVEDORES[documento.provedor].nome} ·{' '}
          {formatarData(diaDoInstante(documento.criadoEm))}
        </Text>
      </View>
      <BotaoIcone
        icone="close-circle-outline"
        cor={cores.textoFraco}
        rotulo="Remover vínculo"
        aoPressionar={() =>
          confirmar(
            'Remover vínculo?',
            `"${documento.nome}" deixa de aparecer aqui. O arquivo continua no seu ${PROVEDORES[documento.provedor].nome}.`,
            () => excluirDocumento(documento.id),
            'Remover',
          )
        }
      />
    </Cartao>
  );
}

/** Seção de documentos (Google Drive e OneDrive) de um processo ou cliente. */
export function SecaoDocumentos({ processoId, clienteId }: { processoId?: string; clienteId?: string }) {
  const documentos = useDados((s) => s.documentos);
  const doRegistro = documentos
    .filter((d) => (processoId ? d.processoId === processoId : d.clienteId === clienteId))
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));

  const parametros = new URLSearchParams();
  if (processoId) parametros.set('processoId', processoId);
  if (clienteId) parametros.set('clienteId', clienteId);
  const sufixo = `?${parametros.toString()}`;

  return (
    <Secao titulo={`Documentos (${doRegistro.length})`}>
      <View style={s.botoes}>
        <Botao
          titulo="Gerar"
          icone="document-text-outline"
          variante="secundario"
          estilo={{ flex: 1 }}
          aoPressionar={() => router.push(`/documento/gerar${sufixo}`)}
        />
        <Botao
          titulo="Importar"
          icone="cloud-download-outline"
          variante="secundario"
          estilo={{ flex: 1 }}
          aoPressionar={() => router.push(`/documento/importar${sufixo}`)}
        />
      </View>
      {doRegistro.length === 0 ? (
        <Text style={estilos.textoSuave}>Nenhum documento vinculado.</Text>
      ) : (
        doRegistro.map((d) => <ItemDocumento key={d.id} documento={d} />)
      )}
    </Secao>
  );
}

/** Aviso exibido quando a integração ainda não foi configurada. */
export function AvisoIntegracao() {
  return (
    <Pressable onPress={() => router.push('/integracoes')}>
      <Cartao estilo={s.aviso}>
        <Ionicons name="link-outline" size={20} color={cores.alerta} />
        <Text style={[estilos.texto, { flex: 1 }]}>
          Conecte o Google Drive ou o OneDrive pelo n8n em{' '}
          <Text style={{ fontWeight: '700' }}>Ajustes › Integrações</Text> para usar esta função.
        </Text>
      </Cartao>
    </Pressable>
  );
}

const s = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: espaco.md, paddingVertical: espaco.md },
  icone: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  botoes: { flexDirection: 'row', gap: espaco.sm },
  aviso: { flexDirection: 'row', alignItems: 'center', gap: espaco.md, backgroundColor: cores.alertaClaro, borderColor: cores.alertaClaro },
});
