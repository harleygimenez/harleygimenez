import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { DataISO } from '../data/types';
import { calcularVencimento, formatarData, formatarDataExtenso, hojeISO } from '../lib/datas';
import { cores, espaco, raio } from '../tema';
import { Botao, Campo, CampoData, Seletor, estilos } from './ui';

const PRAZOS_COMUNS = [5, 10, 15, 30];

/** Calcula o vencimento de um prazo a partir da data de intimação. */
export function CalculadoraPrazo({ aoAplicar, rotuloAplicar = 'Usar esta data' }: { aoAplicar?: (data: DataISO) => void; rotuloAplicar?: string }) {
  const [inicio, setInicio] = useState<DataISO>(hojeISO());
  const [dias, setDias] = useState('15');
  const [contagem, setContagem] = useState<'uteis' | 'corridos'>('uteis');
  const [recesso, setRecesso] = useState<'sim' | 'nao'>('sim');

  const n = Number(dias);
  const vencimento =
    inicio && Number.isInteger(n) && n > 0 && n <= 3650
      ? calcularVencimento(inicio, n, { diasUteis: contagem === 'uteis', considerarRecesso: recesso === 'sim' })
      : null;

  return (
    <View style={{ gap: espaco.lg }}>
      <CampoData rotulo="Data da intimação / publicação" valor={inicio} aoMudar={setInicio} />
      <View style={{ gap: espaco.sm }}>
        <Campo
          rotulo="Prazo em dias"
          value={dias}
          onChangeText={(t) => setDias(t.replace(/\D/g, '').slice(0, 4))}
          keyboardType="number-pad"
        />
        <Seletor
          opcoes={PRAZOS_COMUNS.map((d) => ({ valor: String(d), rotulo: `${d} dias` }))}
          valor={dias}
          aoMudar={setDias}
        />
      </View>
      <Seletor<'uteis' | 'corridos'>
        rotulo="Contagem"
        opcoes={[
          { valor: 'uteis', rotulo: 'Dias úteis (CPC)' },
          { valor: 'corridos', rotulo: 'Dias corridos' },
        ]}
        valor={contagem}
        aoMudar={setContagem}
      />
      <Seletor<'sim' | 'nao'>
        rotulo="Suspender no recesso (20/12 a 20/01)"
        opcoes={[
          { valor: 'sim', rotulo: 'Sim' },
          { valor: 'nao', rotulo: 'Não' },
        ]}
        valor={recesso}
        aoMudar={setRecesso}
      />

      {vencimento && (
        <View style={s.resultado}>
          <Text style={s.resultadoRotulo}>Vencimento</Text>
          <Text style={s.resultadoData}>{formatarData(vencimento)}</Text>
          <Text style={estilos.textoSuave}>{formatarDataExtenso(vencimento)}</Text>
          {aoAplicar && <Botao titulo={rotuloAplicar} icone="checkmark" estilo={{ marginTop: espaco.sm }} aoPressionar={() => aoAplicar(vencimento)} />}
        </View>
      )}

      <Text style={s.aviso}>
        Considera feriados nacionais, Carnaval, Sexta-feira Santa e Corpus Christi. Feriados locais, suspensões
        do tribunal e regras especiais (prazo em dobro, processo penal, juizados) não são considerados: confira
        sempre o calendário do tribunal.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  resultado: {
    backgroundColor: cores.primariaClara,
    borderRadius: raio.lg,
    padding: espaco.lg,
    alignItems: 'center',
    gap: 2,
  },
  resultadoRotulo: { fontSize: 12, fontWeight: '700', color: cores.primaria, textTransform: 'uppercase', letterSpacing: 0.6 },
  resultadoData: { fontSize: 28, fontWeight: '800', color: cores.primaria },
  aviso: { fontSize: 12, color: cores.textoFraco, lineHeight: 17 },
});
