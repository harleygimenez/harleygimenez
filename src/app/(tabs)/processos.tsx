import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';

import { CartaoProcesso } from '../../components/cartoes';
import { PipelineQuadro } from '../../components/PipelineQuadro';
import { BotaoFlutuante, Busca, Seletor, Segmentado, Vazio, estilos } from '../../components/ui';
import { buscarProcessos } from '../../data/selectors';
import { useDados } from '../../data/store';
import { ETAPAS, type StatusProcesso } from '../../data/types';
import { espaco } from '../../tema';

type Visao = 'lista' | 'pipeline';
type FiltroStatus = StatusProcesso | 'todos';

const ORDEM_ETAPA = new Map<string, number>(ETAPAS.map((e, i) => [e.id, i]));

export default function Processos() {
  const processos = useDados((s) => s.processos);
  const clientes = useDados((s) => s.clientes);
  const [visao, setVisao] = useState<Visao>('lista');
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState<FiltroStatus>('ativo');

  const filtrados = useMemo(
    () =>
      buscarProcessos({ processos, clientes }, busca)
        .filter((p) => status === 'todos' || p.status === status)
        .sort(
          (a, b) =>
            (ORDEM_ETAPA.get(a.etapa) ?? 0) - (ORDEM_ETAPA.get(b.etapa) ?? 0) || a.titulo.localeCompare(b.titulo),
        ),
    [processos, clientes, busca, status],
  );

  return (
    <View style={estilos.tela}>
      <View style={{ padding: espaco.lg, paddingBottom: 0, gap: espaco.md }}>
        <Segmentado<Visao>
          opcoes={[
            { valor: 'lista', rotulo: 'Lista' },
            { valor: 'pipeline', rotulo: 'Pipeline' },
          ]}
          valor={visao}
          aoMudar={setVisao}
        />
        <Busca valor={busca} aoMudar={setBusca} placeholder="Título, número, cliente, parte…" />
        <Seletor<FiltroStatus>
          opcoes={[
            { valor: 'ativo', rotulo: 'Ativos' },
            { valor: 'arquivado', rotulo: 'Arquivados' },
            { valor: 'todos', rotulo: 'Todos' },
          ]}
          valor={status}
          aoMudar={setStatus}
        />
      </View>

      {visao === 'pipeline' ? (
        <PipelineQuadro processos={filtrados} />
      ) : (
        <FlatList
          data={filtrados}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: espaco.lg, gap: espaco.sm, paddingBottom: 96 }}
          renderItem={({ item }) => <CartaoProcesso processo={item} />}
          ListEmptyComponent={
            <Vazio
              icone="briefcase-outline"
              titulo={busca ? 'Nenhum processo encontrado' : 'Nenhum processo cadastrado'}
              texto={busca ? 'Tente outro termo de busca.' : 'Toque em + para cadastrar o primeiro.'}
            />
          }
        />
      )}

      <BotaoFlutuante rotulo="Novo processo" aoPressionar={() => router.push('/processo/form')} />
    </View>
  );
}
