import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Tabs } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CartaoCompromisso } from '../../components/cartoes';
import { BotaoIcone, Cartao, Secao, Tela, Vazio, estilos, type NomeIcone } from '../../components/ui';
import {
  compromissosAtrasados,
  compromissosProximos,
  lancamentosDoMes,
  resumirLancamentos,
} from '../../data/selectors';
import { useDados } from '../../data/store';
import { formatarDataExtenso, hojeISO, nomeMes } from '../../lib/datas';
import { formatarMoeda } from '../../lib/formatos';
import { cores, espaco, raio } from '../../tema';

function Indicador({ valor, rotulo, cor, aoPressionar }: { valor: number; rotulo: string; cor: string; aoPressionar: () => void }) {
  return (
    <Pressable onPress={aoPressionar} style={({ pressed }) => [s.indicador, pressed && { opacity: 0.8 }]}>
      <Text style={[s.indicadorValor, { color: cor }]}>{valor}</Text>
      <Text style={s.indicadorRotulo}>{rotulo}</Text>
    </Pressable>
  );
}

function Atalho({ icone, rotulo, rota }: { icone: NomeIcone; rotulo: string; rota: string }) {
  return (
    <Pressable onPress={() => router.push(rota)} style={({ pressed }) => [s.atalho, pressed && { opacity: 0.8 }]}>
      <View style={s.atalhoIcone}>
        <Ionicons name={icone} size={22} color={cores.primaria} />
      </View>
      <Text style={s.atalhoRotulo}>{rotulo}</Text>
    </Pressable>
  );
}

export default function Inicio() {
  const compromissos = useDados((s) => s.compromissos);
  const processos = useDados((s) => s.processos);
  const lancamentos = useDados((s) => s.lancamentos);
  const hoje = hojeISO();

  const atrasados = useMemo(() => compromissosAtrasados(compromissos, hoje), [compromissos, hoje]);
  const proximos = useMemo(() => compromissosProximos(compromissos, 7, hoje), [compromissos, hoje]);
  const deHoje = proximos.filter((c) => c.data === hoje);
  const ativos = processos.filter((p) => p.status === 'ativo').length;
  const resumo = useMemo(() => resumirLancamentos(lancamentosDoMes(lancamentos, hoje), hoje), [lancamentos, hoje]);

  return (
    <Tela>
      <Tabs.Screen
        options={{
          title: 'OpenJus',
          headerRight: () => (
            <View style={{ marginRight: espaco.lg }}>
              <BotaoIcone icone="settings-outline" cor="#fff" rotulo="Ajustes" aoPressionar={() => router.push('/ajustes')} />
            </View>
          ),
        }}
      />

      <View>
        <Text style={s.saudacao}>Olá! 👋</Text>
        <Text style={estilos.textoSuave}>{formatarDataExtenso(hoje)}</Text>
      </View>

      <View style={s.indicadores}>
        <Indicador valor={atrasados.length} rotulo="Atrasados" cor={cores.perigo} aoPressionar={() => router.push('/agenda')} />
        <Indicador valor={deHoje.length} rotulo="Para hoje" cor={cores.alerta} aoPressionar={() => router.push('/agenda')} />
        <Indicador valor={proximos.length} rotulo="Próx. 7 dias" cor={cores.primaria} aoPressionar={() => router.push('/agenda')} />
        <Indicador valor={ativos} rotulo="Processos" cor={cores.sucesso} aoPressionar={() => router.push('/processos')} />
      </View>

      <View style={s.atalhos}>
        <Atalho icone="briefcase-outline" rotulo="Processo" rota="/processo/form" />
        <Atalho icone="alarm-outline" rotulo="Prazo" rota="/compromisso/form?tipo=prazo" />
        <Atalho icone="calculator-outline" rotulo="Calcular prazo" rota="/calculadora" />
        <Atalho icone="person-add-outline" rotulo="Cliente" rota="/cliente/form" />
      </View>

      {atrasados.length > 0 && (
        <Secao titulo="Atrasados">
          {atrasados.map((c) => (
            <CartaoCompromisso key={c.id} compromisso={c} />
          ))}
        </Secao>
      )}

      <Secao titulo="Próximos 7 dias" acao={{ rotulo: 'Ver agenda', aoPressionar: () => router.push('/agenda') }}>
        {proximos.length === 0 ? (
          <Cartao>
            <Vazio icone="sunny-outline" titulo="Semana tranquila" texto="Nenhum prazo ou compromisso pendente." />
          </Cartao>
        ) : (
          proximos.map((c) => <CartaoCompromisso key={c.id} compromisso={c} />)
        )}
      </Secao>

      <Secao titulo={`Financeiro · ${nomeMes(hoje)}`} acao={{ rotulo: 'Detalhes', aoPressionar: () => router.push('/financeiro') }}>
        <Cartao estilo={{ gap: espaco.md }}>
          <View style={s.linhaResumo}>
            <Text style={estilos.textoSuave}>Recebido</Text>
            <Text style={[s.valor, { color: cores.sucesso }]}>{formatarMoeda(resumo.recebido)}</Text>
          </View>
          <View style={s.linhaResumo}>
            <Text style={estilos.textoSuave}>A receber</Text>
            <Text style={s.valor}>{formatarMoeda(resumo.aReceber)}</Text>
          </View>
          <View style={s.linhaResumo}>
            <Text style={estilos.textoSuave}>Despesas</Text>
            <Text style={[s.valor, { color: cores.perigo }]}>{formatarMoeda(resumo.pago + resumo.aPagar)}</Text>
          </View>
          {resumo.vencido > 0 && (
            <View style={[s.linhaResumo, s.alerta]}>
              <Text style={{ color: cores.perigo, fontWeight: '600' }}>Honorários vencidos</Text>
              <Text style={[s.valor, { color: cores.perigo }]}>{formatarMoeda(resumo.vencido)}</Text>
            </View>
          )}
        </Cartao>
      </Secao>
    </Tela>
  );
}

const s = StyleSheet.create({
  saudacao: { fontSize: 24, fontWeight: '700', color: cores.texto },
  indicadores: { flexDirection: 'row', gap: espaco.sm },
  indicador: {
    flex: 1,
    backgroundColor: cores.superficie,
    borderRadius: raio.lg,
    borderWidth: 1,
    borderColor: cores.borda,
    paddingVertical: espaco.md,
    alignItems: 'center',
  },
  indicadorValor: { fontSize: 24, fontWeight: '800' },
  indicadorRotulo: { fontSize: 11, color: cores.textoSuave, marginTop: 2, textAlign: 'center' },
  atalhos: { flexDirection: 'row', justifyContent: 'space-between' },
  atalho: { alignItems: 'center', gap: 6, flex: 1 },
  atalhoIcone: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: cores.primariaClara,
    alignItems: 'center',
    justifyContent: 'center',
  },
  atalhoRotulo: { fontSize: 12, color: cores.texto, fontWeight: '500', textAlign: 'center' },
  linhaResumo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  valor: { fontSize: 16, fontWeight: '700', color: cores.texto, fontVariant: ['tabular-nums'] },
  alerta: { backgroundColor: cores.perigoClaro, marginHorizontal: -espaco.sm, padding: espaco.sm, borderRadius: raio.sm },
});
