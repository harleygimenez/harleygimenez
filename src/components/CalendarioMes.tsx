import { addMonths, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from 'date-fns';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { DataISO } from '../data/types';
import { deISO, ehFeriado, hojeISO, nomeMes, paraISO, somarDias } from '../lib/datas';
import { cores, espaco, raio } from '../tema';
import { BotaoIcone } from './ui';

const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export function primeiroDoMes(data: DataISO): DataISO {
  return paraISO(startOfMonth(deISO(data)));
}

export function mudarMes(data: DataISO, meses: number): DataISO {
  return paraISO(addMonths(startOfMonth(deISO(data)), meses));
}

/** Semanas (domingo a sábado) que cobrem o mês inteiro. */
export function semanasDoMes(mes: DataISO): DataISO[][] {
  const inicio = paraISO(startOfWeek(startOfMonth(deISO(mes))));
  const fim = paraISO(endOfWeek(endOfMonth(deISO(mes))));
  const semanas: DataISO[][] = [];
  for (let dia = inicio; dia <= fim; ) {
    const semana: DataISO[] = [];
    for (let i = 0; i < 7; i++) {
      semana.push(dia);
      dia = somarDias(dia, 1);
    }
    semanas.push(semana);
  }
  return semanas;
}

export function CalendarioMes({
  mes,
  selecionado,
  marcadores,
  aoSelecionar,
  aoMudarMes,
}: {
  mes: DataISO;
  selecionado: DataISO;
  /** Cores dos pontos exibidos em cada dia. */
  marcadores: Record<DataISO, string[]>;
  aoSelecionar: (dia: DataISO) => void;
  aoMudarMes: (mes: DataISO) => void;
}) {
  const hoje = hojeISO();
  const mesAtual = mes.slice(0, 7);

  return (
    <View style={s.container}>
      <View style={s.cabecalho}>
        <BotaoIcone icone="chevron-back" rotulo="Mês anterior" aoPressionar={() => aoMudarMes(mudarMes(mes, -1))} />
        <Pressable onPress={() => { aoMudarMes(primeiroDoMes(hoje)); aoSelecionar(hoje); }}>
          <Text style={s.titulo}>{nomeMes(mes)}</Text>
        </Pressable>
        <BotaoIcone icone="chevron-forward" rotulo="Próximo mês" aoPressionar={() => aoMudarMes(mudarMes(mes, 1))} />
      </View>
      <View style={s.semana}>
        {DIAS_SEMANA.map((d, i) => (
          <Text key={i} style={s.diaSemana}>
            {d}
          </Text>
        ))}
      </View>
      {semanasDoMes(mes).map((semana) => (
        <View key={semana[0]} style={s.semana}>
          {semana.map((dia) => {
            const foraDoMes = !dia.startsWith(mesAtual);
            const ativo = dia === selecionado;
            const pontos = marcadores[dia] ?? [];
            const fimDeSemana = [0, 6].includes(deISO(dia).getDay()) || ehFeriado(dia);
            return (
              <Pressable
                key={dia}
                accessibilityRole="button"
                accessibilityLabel={dia}
                onPress={() => aoSelecionar(dia)}
                style={s.celula}
              >
                <View style={[s.numero, dia === hoje && s.hoje, ativo && s.ativo]}>
                  <Text
                    style={[
                      s.numeroTexto,
                      fimDeSemana && { color: cores.textoFraco },
                      foraDoMes && { opacity: 0.35 },
                      dia === hoje && { color: cores.primaria, fontWeight: '700' },
                      ativo && { color: '#fff' },
                    ]}
                  >
                    {Number(dia.slice(8))}
                  </Text>
                </View>
                <View style={s.pontos}>
                  {pontos.slice(0, 3).map((cor, i) => (
                    <View key={i} style={[s.ponto, { backgroundColor: cor }]} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    backgroundColor: cores.superficie,
    borderRadius: raio.lg,
    borderWidth: 1,
    borderColor: cores.borda,
    padding: espaco.md,
  },
  cabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: espaco.sm },
  titulo: { fontSize: 16, fontWeight: '700', color: cores.texto },
  semana: { flexDirection: 'row' },
  diaSemana: { flex: 1, textAlign: 'center', fontSize: 12, color: cores.textoFraco, fontWeight: '600', marginBottom: 4 },
  celula: { flex: 1, alignItems: 'center', paddingVertical: 3 },
  numero: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  hoje: { backgroundColor: cores.primariaClara },
  ativo: { backgroundColor: cores.primaria },
  numeroTexto: { fontSize: 14, color: cores.texto },
  pontos: { flexDirection: 'row', gap: 2, height: 6, marginTop: 1 },
  ponto: { width: 5, height: 5, borderRadius: 3 },
});
