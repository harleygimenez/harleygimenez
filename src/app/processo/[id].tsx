import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CartaoCompromisso, CartaoLancamento, etapaDe } from '../../components/cartoes';
import { LinhaDoTempo } from '../../components/LinhaDoTempo';
import { Botao, BotaoIcone, Cartao, LinhaInfo, Secao, Segmentado, Selo, Tela, Vazio, estilos } from '../../components/ui';
import { linhaDoTempo, ordenarCompromissos, resumirLancamentos } from '../../data/selectors';
import { useDados } from '../../data/store';
import { ETAPAS } from '../../data/types';
import { segmentoJustica, validarCnj } from '../../lib/cnj';
import { formatarData } from '../../lib/datas';
import { centavosParaTexto, formatarMoeda } from '../../lib/formatos';
import { cores, espaco, raio } from '../../tema';

type Aba = 'resumo' | 'linha' | 'prazos' | 'financeiro';

/** Trilha das fases: mostra onde o processo está e permite movê-lo. */
function TrilhaDeFases({ processoId, atual }: { processoId: string; atual: string }) {
  const moverEtapa = useDados((s) => s.moverEtapa);
  const indiceAtual = ETAPAS.findIndex((e) => e.id === atual);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.trilha}>
      {ETAPAS.map((etapa, i) => {
        const feita = i < indiceAtual;
        const ativa = i === indiceAtual;
        return (
          <View key={etapa.id} style={s.passoContainer}>
            {i > 0 && <View style={[s.conector, (feita || ativa) && { backgroundColor: etapa.cor }]} />}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Mover para ${etapa.nome}`}
              onPress={() => moverEtapa(processoId, etapa.id)}
              style={s.passo}
            >
              <View
                style={[
                  s.bolinha,
                  feita && { backgroundColor: etapa.cor, borderColor: etapa.cor },
                  ativa && { borderColor: etapa.cor, borderWidth: 3 },
                ]}
              >
                {feita && <Ionicons name="checkmark" size={14} color="#fff" />}
                {ativa && <View style={[s.miolo, { backgroundColor: etapa.cor }]} />}
              </View>
              <Text style={[s.passoTexto, ativa && { color: cores.texto, fontWeight: '700' }]} numberOfLines={2}>
                {etapa.nome}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

export default function DetalheProcesso() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const dados = useDados();
  const processo = dados.processos.find((p) => p.id === id);
  const [aba, setAba] = useState<Aba>('resumo');

  const itens = useMemo(() => (processo ? linhaDoTempo(dados, processo.id) : []), [dados, processo]);

  if (!processo) {
    return (
      <Tela>
        <Vazio icone="alert-circle-outline" titulo="Processo não encontrado" texto="Ele pode ter sido excluído." />
      </Tela>
    );
  }

  const cliente = dados.clientes.find((c) => c.id === processo.clienteId);
  const etapa = etapaDe(processo);
  const compromissos = ordenarCompromissos(dados.compromissos.filter((c) => c.processoId === processo.id));
  const pendentes = compromissos.filter((c) => !c.concluido);
  const concluidos = compromissos.filter((c) => c.concluido);
  const lancamentos = dados.lancamentos
    .filter((l) => l.processoId === processo.id)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const resumo = resumirLancamentos(lancamentos);
  const atendimentos = dados.atendimentos
    .filter((a) => a.processoId === processo.id)
    .sort((a, b) => b.data.localeCompare(a.data));
  const numeroValido = processo.numero ? validarCnj(processo.numero) : true;
  const novo = (rota: string) => router.push(`${rota}?processoId=${processo.id}`);

  return (
    <Tela>
      <Stack.Screen
        options={{
          headerRight: () => (
            <BotaoIcone
              icone="create-outline"
              cor="#fff"
              rotulo="Editar processo"
              aoPressionar={() => router.push(`/processo/form?id=${processo.id}`)}
            />
          ),
        }}
      />

      <Cartao estilo={{ gap: espaco.sm }}>
        <View style={[estilos.linha, { flexWrap: 'wrap' }]}>
          <Selo texto={etapa.nome} cor={etapa.cor} />
          <Selo texto={processo.area} cor={cores.textoSuave} />
          {processo.status === 'arquivado' && <Selo texto="Arquivado" cor={cores.textoSuave} />}
        </View>
        <Text style={s.titulo}>{processo.titulo}</Text>
        {!!processo.numero && (
          <View style={estilos.linha}>
            <Text style={[estilos.texto, { fontVariant: ['tabular-nums'] }]} selectable>
              {processo.numero}
            </Text>
            {!numeroValido && <Selo texto="Dígito inválido" cor={cores.alerta} />}
          </View>
        )}
        {cliente && (
          <Pressable onPress={() => router.push(`/cliente/${cliente.id}`)} style={estilos.linha}>
            <Ionicons name="person-outline" size={16} color={cores.primaria} />
            <Text style={{ color: cores.primaria, fontWeight: '600' }}>{cliente.nome}</Text>
          </Pressable>
        )}
      </Cartao>

      <Secao titulo="Fase do processo">
        <TrilhaDeFases processoId={processo.id} atual={processo.etapa} />
      </Secao>

      <Segmentado<Aba>
        opcoes={[
          { valor: 'resumo', rotulo: 'Resumo' },
          { valor: 'linha', rotulo: 'Timeline' },
          { valor: 'prazos', rotulo: `Agenda (${pendentes.length})` },
          { valor: 'financeiro', rotulo: 'Finanças' },
        ]}
        valor={aba}
        aoMudar={setAba}
      />

      {aba === 'resumo' && (
        <>
          <Cartao estilo={{ gap: espaco.md }}>
            <LinhaInfo rotulo="Parte contrária" valor={processo.parteContraria} />
            <LinhaInfo
              rotulo="Tribunal"
              valor={[processo.tribunal, segmentoJustica(processo.numero)].filter(Boolean).join(' · ')}
            />
            <LinhaInfo rotulo="Órgão / vara" valor={processo.orgao} />
            <LinhaInfo rotulo="Valor da causa" valor={centavosParaTexto(processo.valorCausa)} />
            <LinhaInfo rotulo="Observações" valor={processo.observacoes} />
          </Cartao>
          <Secao
            titulo="Atendimentos"
            acao={
              cliente
                ? {
                    rotulo: 'Registrar',
                    aoPressionar: () => router.push(`/atendimento/form?clienteId=${cliente.id}&processoId=${processo.id}`),
                  }
                : undefined
            }
          >
            {atendimentos.length === 0 ? (
              <Text style={estilos.textoSuave}>Nenhum atendimento vinculado a este processo.</Text>
            ) : (
              atendimentos.map((a) => (
                <Cartao key={a.id} aoPressionar={() => router.push(`/atendimento/form?id=${a.id}`)}>
                  <Text style={estilos.textoSuave}>{formatarData(a.data)}</Text>
                  <Text style={estilos.titulo}>{a.assunto}</Text>
                  {!!a.descricao && <Text style={estilos.textoSuave}>{a.descricao}</Text>}
                </Cartao>
              ))
            )}
          </Secao>
        </>
      )}

      {aba === 'linha' && (
        <>
          <View style={s.botoes}>
            <Botao titulo="Andamento" icone="add" variante="secundario" estilo={{ flex: 1 }} aoPressionar={() => novo('/andamento/form')} />
            <Botao titulo="Prazo" icone="add" variante="secundario" estilo={{ flex: 1 }} aoPressionar={() => novo('/compromisso/form')} />
          </View>
          <Cartao>
            <LinhaDoTempo itens={itens} />
          </Cartao>
        </>
      )}

      {aba === 'prazos' && (
        <>
          <Botao titulo="Novo prazo ou compromisso" icone="add" variante="secundario" aoPressionar={() => novo('/compromisso/form')} />
          <Secao titulo="Pendentes">
            {pendentes.length === 0 ? (
              <Text style={estilos.textoSuave}>Nenhum compromisso pendente.</Text>
            ) : (
              pendentes.map((c) => <CartaoCompromisso key={c.id} compromisso={c} mostrarProcesso={false} />)
            )}
          </Secao>
          {concluidos.length > 0 && (
            <Secao titulo="Concluídos">
              {concluidos.map((c) => (
                <CartaoCompromisso key={c.id} compromisso={c} mostrarProcesso={false} />
              ))}
            </Secao>
          )}
        </>
      )}

      {aba === 'financeiro' && (
        <>
          <Cartao estilo={s.resumoFin}>
            <View style={{ flex: 1 }}>
              <Text style={estilos.textoSuave}>Recebido</Text>
              <Text style={[s.valor, { color: cores.sucesso }]}>{formatarMoeda(resumo.recebido)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={estilos.textoSuave}>A receber</Text>
              <Text style={s.valor}>{formatarMoeda(resumo.aReceber)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={estilos.textoSuave}>Despesas</Text>
              <Text style={[s.valor, { color: cores.perigo }]}>{formatarMoeda(resumo.pago + resumo.aPagar)}</Text>
            </View>
          </Cartao>
          <Botao titulo="Novo lançamento" icone="add" variante="secundario" aoPressionar={() => novo('/lancamento/form')} />
          {lancamentos.length === 0 ? (
            <Vazio icone="wallet-outline" titulo="Sem lançamentos" />
          ) : (
            lancamentos.map((l) => <CartaoLancamento key={l.id} lancamento={l} />)
          )}
        </>
      )}
    </Tela>
  );
}

const s = StyleSheet.create({
  titulo: { fontSize: 20, fontWeight: '700', color: cores.texto },
  trilha: { paddingVertical: espaco.xs, paddingRight: espaco.lg },
  passoContainer: { flexDirection: 'row', alignItems: 'flex-start' },
  conector: { width: 18, height: 2, backgroundColor: cores.borda, marginTop: 13 },
  passo: { width: 76, alignItems: 'center', gap: 4 },
  bolinha: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miolo: { width: 10, height: 10, borderRadius: 5 },
  passoTexto: { fontSize: 11, color: cores.textoSuave, textAlign: 'center' },
  botoes: { flexDirection: 'row', gap: espaco.sm },
  resumoFin: { flexDirection: 'row', gap: espaco.sm, borderRadius: raio.lg },
  valor: { fontSize: 15, fontWeight: '700', color: cores.texto, fontVariant: ['tabular-nums'] },
});
