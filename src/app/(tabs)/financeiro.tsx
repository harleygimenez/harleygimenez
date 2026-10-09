import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { mudarMes, primeiroDoMes } from '../../components/CalendarioMes';
import { CartaoLancamento } from '../../components/cartoes';
import { BotaoFlutuante, BotaoIcone, Cartao, Secao, Seletor, Tela, Vazio, estilos } from '../../components/ui';
import { lancamentosDoMes, resumirLancamentos } from '../../data/selectors';
import { useDados } from '../../data/store';
import type { DataISO, TipoLancamento } from '../../data/types';
import { hojeISO, nomeMes } from '../../lib/datas';
import { formatarMoeda } from '../../lib/formatos';
import { cores, espaco } from '../../tema';

type FiltroTipo = TipoLancamento | 'todos';
type FiltroSituacao = 'todos' | 'pendentes' | 'quitados';

function Bloco({ rotulo, valor, cor = cores.texto }: { rotulo: string; valor: number; cor?: string }) {
  return (
    <View style={s.bloco}>
      <Text style={estilos.textoSuave}>{rotulo}</Text>
      <Text style={[s.valor, { color: cor }]}>{formatarMoeda(valor)}</Text>
    </View>
  );
}

export default function Financeiro() {
  const lancamentos = useDados((st) => st.lancamentos);
  const hoje = hojeISO();
  const [mes, setMes] = useState<DataISO>(primeiroDoMes(hoje));
  const [tipo, setTipo] = useState<FiltroTipo>('todos');
  const [situacao, setSituacao] = useState<FiltroSituacao>('todos');

  const doMes = useMemo(() => lancamentosDoMes(lancamentos, mes), [lancamentos, mes]);
  const resumo = useMemo(() => resumirLancamentos(doMes, hoje), [doMes, hoje]);
  const filtrados = doMes.filter(
    (l) =>
      (tipo === 'todos' || l.tipo === tipo) &&
      (situacao === 'todos' || (situacao === 'quitados') === l.pago),
  );
  const previsto = resumo.recebido + resumo.aReceber - resumo.pago - resumo.aPagar;

  return (
    <Tela rodape={<BotaoFlutuante rotulo="Novo lançamento" aoPressionar={() => router.push('/lancamento/form')} />}>
      <View style={[estilos.linha, { justifyContent: 'space-between' }]}>
        <BotaoIcone icone="chevron-back" rotulo="Mês anterior" aoPressionar={() => setMes(mudarMes(mes, -1))} />
        <Text style={estilos.titulo}>{nomeMes(mes)}</Text>
        <BotaoIcone icone="chevron-forward" rotulo="Próximo mês" aoPressionar={() => setMes(mudarMes(mes, 1))} />
      </View>

      <Cartao estilo={{ gap: espaco.md }}>
        <View style={s.grade}>
          <Bloco rotulo="Recebido" valor={resumo.recebido} cor={cores.sucesso} />
          <Bloco rotulo="A receber" valor={resumo.aReceber} />
        </View>
        <View style={s.grade}>
          <Bloco rotulo="Despesas pagas" valor={resumo.pago} cor={cores.perigo} />
          <Bloco rotulo="A pagar" valor={resumo.aPagar} />
        </View>
        <View style={s.divisor} />
        <View style={s.grade}>
          <Bloco rotulo="Saldo realizado" valor={resumo.saldo} cor={resumo.saldo >= 0 ? cores.sucesso : cores.perigo} />
          <Bloco rotulo="Saldo previsto" valor={previsto} cor={previsto >= 0 ? cores.primaria : cores.perigo} />
        </View>
      </Cartao>

      <View style={{ gap: espaco.sm }}>
        <Seletor<FiltroTipo>
          opcoes={[
            { valor: 'todos', rotulo: 'Tudo' },
            { valor: 'receita', rotulo: 'Receitas', cor: cores.sucesso },
            { valor: 'despesa', rotulo: 'Despesas', cor: cores.perigo },
          ]}
          valor={tipo}
          aoMudar={setTipo}
        />
        <Seletor<FiltroSituacao>
          opcoes={[
            { valor: 'todos', rotulo: 'Todas' },
            { valor: 'pendentes', rotulo: 'Pendentes' },
            { valor: 'quitados', rotulo: 'Quitadas' },
          ]}
          valor={situacao}
          aoMudar={setSituacao}
        />
      </View>

      <Secao titulo={`Lançamentos (${filtrados.length})`}>
        {filtrados.length === 0 ? (
          <Cartao>
            <Vazio icone="wallet-outline" titulo="Nenhum lançamento neste mês" />
          </Cartao>
        ) : (
          filtrados.map((l) => <CartaoLancamento key={l.id} lancamento={l} />)
        )}
      </Secao>
    </Tela>
  );
}

const s = StyleSheet.create({
  grade: { flexDirection: 'row', gap: espaco.md },
  bloco: { flex: 1, gap: 2 },
  valor: { fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
  divisor: { height: 1, backgroundColor: cores.borda },
});
