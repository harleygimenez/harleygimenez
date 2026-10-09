import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { abrirDocumento } from '../components/Documentos';
import { BotaoFlutuante, BotaoIcone, Cartao, Secao, Tela, Vazio, estilos } from '../components/ui';
import { useDados } from '../data/store';
import { linkDocumentoGoogle } from '../lib/google';
import { CAMPOS_DISPONIVEIS } from '../lib/mesclagem';
import { cores, espaco } from '../tema';

export default function Modelos() {
  const modelos = useDados((s) => s.modelos);

  return (
    <Tela rodape={<BotaoFlutuante rotulo="Novo modelo" aoPressionar={() => router.push('/modelo/form')} />}>
      <Text style={estilos.textoSuave}>
        Um modelo é um documento do Google Docs com campos entre chaves duplas, como {'{{cliente.nome}}'}. Ao gerar,
        uma cópia é criada na sua pasta do Drive com os campos preenchidos.
      </Text>

      <Secao titulo={`Modelos (${modelos.length})`}>
        {modelos.length === 0 ? (
          <Cartao>
            <Vazio icone="documents-outline" titulo="Nenhum modelo" texto="Toque em + para cadastrar o primeiro." />
          </Cartao>
        ) : (
          [...modelos]
            .sort((a, b) => a.nome.localeCompare(b.nome))
            .map((m) => (
              <Cartao key={m.id} aoPressionar={() => router.push(`/modelo/form?id=${m.id}`)} estilo={s.modelo}>
                <Ionicons name="document-text-outline" size={22} color={cores.primaria} />
                <View style={{ flex: 1 }}>
                  <Text style={estilos.titulo}>{m.nome}</Text>
                  {!!m.descricao && <Text style={estilos.textoSuave}>{m.descricao}</Text>}
                </View>
                <BotaoIcone
                  icone="open-outline"
                  rotulo="Abrir modelo no Google Docs"
                  aoPressionar={() => abrirDocumento({ nome: m.nome, url: linkDocumentoGoogle(m.googleDocId) })}
                />
              </Cartao>
            ))
        )}
      </Secao>

      <Secao titulo="Campos disponíveis">
        <Cartao estilo={{ gap: espaco.sm }}>
          {CAMPOS_DISPONIVEIS.map((c) => (
            <View key={c.chave}>
              <Text style={s.chave} selectable>{`{{${c.chave}}}`}</Text>
              <Text style={estilos.textoSuave}>{c.descricao}</Text>
            </View>
          ))}
        </Cartao>
      </Secao>
    </Tela>
  );
}

const s = StyleSheet.create({
  modelo: { flexDirection: 'row', alignItems: 'center', gap: espaco.md },
  chave: { fontSize: 13, color: cores.primaria, fontFamily: 'monospace' },
});
