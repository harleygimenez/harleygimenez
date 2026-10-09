import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ItemLinhaDoTempo } from '../data/selectors';
import { TIPOS_COMPROMISSO } from '../data/types';
import { formatarData } from '../lib/datas';
import { formatarMoeda } from '../lib/formatos';
import { cores, espaco } from '../tema';
import { Vazio, type NomeIcone } from './ui';

const ICONES_ANDAMENTO: Record<string, NomeIcone> = {
  andamento: 'git-commit-outline',
  peticao: 'document-text-outline',
  despacho: 'chatbox-ellipses-outline',
  decisao: 'hammer-outline',
  sentenca: 'ribbon-outline',
  publicacao: 'newspaper-outline',
  nota: 'create-outline',
  etapa: 'flag-outline',
};

function aparencia(item: ItemLinhaDoTempo): { icone: NomeIcone; cor: string } {
  switch (item.tipo) {
    case 'andamento':
      return {
        icone: ICONES_ANDAMENTO[item.item.tipo] ?? 'ellipse',
        cor: item.item.tipo === 'etapa' ? cores.destaque : cores.primaria,
      };
    case 'compromisso':
      return {
        icone: item.item.concluido ? 'checkmark-done-outline' : 'calendar-outline',
        cor: TIPOS_COMPROMISSO[item.item.tipo].cor,
      };
    case 'lancamento':
      return {
        icone: item.item.tipo === 'receita' ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline',
        cor: item.item.tipo === 'receita' ? cores.sucesso : cores.perigo,
      };
  }
}

function rotaDe(item: ItemLinhaDoTempo): string {
  switch (item.tipo) {
    case 'andamento':
      return `/andamento/form?id=${item.id}`;
    case 'compromisso':
      return `/compromisso/form?id=${item.id}`;
    case 'lancamento':
      return `/lancamento/form?id=${item.id}`;
  }
}

export function LinhaDoTempo({ itens }: { itens: ItemLinhaDoTempo[] }) {
  if (itens.length === 0) {
    return <Vazio icone="time-outline" titulo="Nada registrado ainda" texto="Adicione andamentos, prazos ou lançamentos." />;
  }
  return (
    <View>
      {itens.map((item, i) => {
        const { icone, cor } = aparencia(item);
        const ultimo = i === itens.length - 1;
        return (
          <Pressable key={`${item.tipo}-${item.id}`} onPress={() => router.push(rotaDe(item))} style={s.item}>
            <View style={s.trilho}>
              <View style={[s.icone, { backgroundColor: `${cor}1A` }]}>
                <Ionicons name={icone} size={16} color={cor} />
              </View>
              {!ultimo && <View style={s.linha} />}
            </View>
            <View style={[s.conteudo, !ultimo && { paddingBottom: espaco.lg }]}>
              <Text style={s.data}>{formatarData(item.data)}</Text>
              <Text style={s.titulo}>{item.titulo}</Text>
              {!!item.descricao && <Text style={s.descricao}>{item.descricao}</Text>}
              {item.tipo === 'lancamento' && (
                <Text style={[s.descricao, { color: cor, fontWeight: '600' }]}>
                  {formatarMoeda(item.item.valor)} · {item.item.pago ? 'quitado' : 'em aberto'}
                </Text>
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  item: { flexDirection: 'row', gap: espaco.md },
  trilho: { alignItems: 'center', width: 32 },
  icone: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  linha: { flex: 1, width: 2, backgroundColor: cores.borda, marginVertical: 2 },
  conteudo: { flex: 1, paddingTop: 4, gap: 2 },
  data: { fontSize: 12, color: cores.textoFraco, fontWeight: '600' },
  titulo: { fontSize: 15, fontWeight: '600', color: cores.texto },
  descricao: { fontSize: 14, color: cores.textoSuave, lineHeight: 20 },
});
