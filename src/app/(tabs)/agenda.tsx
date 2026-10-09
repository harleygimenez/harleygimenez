import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { CalendarioMes, primeiroDoMes } from '../../components/CalendarioMes';
import { CartaoCompromisso } from '../../components/cartoes';
import { BotaoFlutuante, Cartao, Secao, Seletor, Tela, Vazio } from '../../components/ui';
import { compromissosAtrasados, ordenarCompromissos } from '../../data/selectors';
import { useDados } from '../../data/store';
import { TIPOS_COMPROMISSO, type DataISO, type TipoCompromisso } from '../../data/types';
import { formatarDataExtenso, hojeISO } from '../../lib/datas';

type Filtro = TipoCompromisso | 'todos';

export default function Agenda() {
  const compromissos = useDados((s) => s.compromissos);
  const hoje = hojeISO();
  const [selecionado, setSelecionado] = useState<DataISO>(hoje);
  const [mes, setMes] = useState<DataISO>(primeiroDoMes(hoje));
  const [filtro, setFiltro] = useState<Filtro>('todos');

  const visiveis = useMemo(
    () => compromissos.filter((c) => filtro === 'todos' || c.tipo === filtro),
    [compromissos, filtro],
  );

  const marcadores = useMemo(() => {
    const mapa: Record<DataISO, string[]> = {};
    for (const c of visiveis) {
      if (c.concluido) continue;
      (mapa[c.data] ??= []).push(TIPOS_COMPROMISSO[c.tipo].cor);
    }
    return mapa;
  }, [visiveis]);

  const doDia = ordenarCompromissos(visiveis.filter((c) => c.data === selecionado));
  const atrasados = compromissosAtrasados(visiveis, hoje);

  const opcoes = [
    { valor: 'todos' as const, rotulo: 'Todos' },
    ...Object.entries(TIPOS_COMPROMISSO).map(([valor, t]) => ({ valor: valor as TipoCompromisso, rotulo: t.nome, cor: t.cor })),
  ];

  return (
    <Tela rodape={<BotaoFlutuante rotulo="Novo compromisso" aoPressionar={() => router.push(`/compromisso/form?data=${selecionado}`)} />}>
      <Seletor<Filtro> opcoes={opcoes} valor={filtro} aoMudar={setFiltro} />

      <CalendarioMes
        mes={mes}
        selecionado={selecionado}
        marcadores={marcadores}
        aoSelecionar={(dia) => {
          setSelecionado(dia);
          if (!dia.startsWith(mes.slice(0, 7))) setMes(primeiroDoMes(dia));
        }}
        aoMudarMes={setMes}
      />

      <Secao titulo={formatarDataExtenso(selecionado)}>
        {doDia.length === 0 ? (
          <Cartao>
            <Vazio icone="calendar-clear-outline" titulo="Nada agendado" texto="Toque em + para adicionar neste dia." />
          </Cartao>
        ) : (
          doDia.map((c) => <CartaoCompromisso key={c.id} compromisso={c} />)
        )}
      </Secao>

      {atrasados.length > 0 && (
        <View>
          <Secao titulo={`Atrasados (${atrasados.length})`}>
            {atrasados.map((c) => (
              <CartaoCompromisso key={c.id} compromisso={c} />
            ))}
          </Secao>
        </View>
      )}
    </Tela>
  );
}
