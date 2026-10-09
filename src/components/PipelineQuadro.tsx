import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useDados } from '../data/store';
import { ETAPAS, type Processo } from '../data/types';
import { cores, espaco, raio, sombra } from '../tema';
import { BotaoIcone } from './ui';

/** Quadro estilo kanban com uma coluna por fase do processo. */
export function PipelineQuadro({ processos }: { processos: Processo[] }) {
  const clientes = useDados((s) => s.clientes);
  const moverEtapa = useDados((s) => s.moverEtapa);
  const nomeCliente = new Map(clientes.map((c) => [c.id, c.nome]));

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={s.quadro}>
      {ETAPAS.map((etapa, indice) => {
        const daEtapa = processos.filter((p) => p.etapa === etapa.id);
        const anterior = ETAPAS[indice - 1];
        const proxima = ETAPAS[indice + 1];
        return (
          <View key={etapa.id} style={s.coluna}>
            <View style={[s.cabecalho, { borderTopColor: etapa.cor }]}>
              <Text style={s.nome}>{etapa.nome}</Text>
              <View style={[s.contador, { backgroundColor: `${etapa.cor}22` }]}>
                <Text style={[s.contadorTexto, { color: etapa.cor }]}>{daEtapa.length}</Text>
              </View>
            </View>
            <ScrollView contentContainerStyle={{ gap: espaco.sm, paddingBottom: espaco.sm }} nestedScrollEnabled>
              {daEtapa.length === 0 && <Text style={s.vazio}>Nenhum processo</Text>}
              {daEtapa.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => router.push(`/processo/${p.id}`)}
                  style={({ pressed }) => [s.cartao, pressed && { opacity: 0.85 }]}
                >
                  <Text style={s.titulo} numberOfLines={2}>
                    {p.titulo}
                  </Text>
                  <Text style={s.sub} numberOfLines={1}>
                    {nomeCliente.get(p.clienteId) ?? 'Sem cliente'}
                  </Text>
                  {!!p.numero && (
                    <Text style={[s.sub, { fontSize: 11 }]} numberOfLines={1}>
                      {p.numero}
                    </Text>
                  )}
                  <View style={s.acoes}>
                    {anterior ? (
                      <BotaoIcone
                        icone="arrow-back"
                        rotulo={`Mover para ${anterior.nome}`}
                        cor={cores.textoSuave}
                        aoPressionar={() => moverEtapa(p.id, anterior.id)}
                      />
                    ) : (
                      <View />
                    )}
                    <Text style={s.area}>{p.area}</Text>
                    {proxima ? (
                      <BotaoIcone
                        icone="arrow-forward"
                        rotulo={`Mover para ${proxima.nome}`}
                        aoPressionar={() => moverEtapa(p.id, proxima.id)}
                      />
                    ) : (
                      <View />
                    )}
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  quadro: { padding: espaco.lg, gap: espaco.md, alignItems: 'flex-start' },
  coluna: {
    width: 250,
    maxHeight: '100%',
    backgroundColor: '#E9EDF2',
    borderRadius: raio.lg,
    padding: espaco.sm,
  },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 3,
    paddingTop: espaco.sm,
    paddingHorizontal: 4,
    marginBottom: espaco.sm,
  },
  nome: { fontSize: 14, fontWeight: '700', color: cores.texto },
  contador: { minWidth: 24, paddingHorizontal: 6, paddingVertical: 2, borderRadius: raio.pill, alignItems: 'center' },
  contadorTexto: { fontSize: 12, fontWeight: '700' },
  vazio: { fontSize: 13, color: cores.textoFraco, textAlign: 'center', paddingVertical: espaco.lg },
  cartao: { backgroundColor: cores.superficie, borderRadius: raio.md, padding: espaco.md, gap: 2, ...sombra },
  titulo: { fontSize: 14, fontWeight: '600', color: cores.texto },
  sub: { fontSize: 12, color: cores.textoSuave },
  acoes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  area: { fontSize: 11, color: cores.textoFraco },
});
