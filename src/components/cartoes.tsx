import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { useDados } from '../data/store';
import {
  CATEGORIAS_LANCAMENTO,
  ETAPAS,
  TIPOS_COMPROMISSO,
  type Compromisso,
  type Lancamento,
  type Processo,
} from '../data/types';
import { descreverDistancia, formatarData, hojeISO } from '../lib/datas';
import { formatarMoeda } from '../lib/formatos';
import { cores, espaco } from '../tema';
import { Cartao, Selo, estilos } from './ui';

export function etapaDe(processo: Processo) {
  return ETAPAS.find((e) => e.id === processo.etapa) ?? ETAPAS[0];
}

export function CartaoProcesso({ processo }: { processo: Processo }) {
  const cliente = useDados((s) => s.clientes.find((c) => c.id === processo.clienteId));
  const etapa = etapaDe(processo);
  return (
    <Cartao aoPressionar={() => router.push(`/processo/${processo.id}`)}>
      <View style={[estilos.linha, { justifyContent: 'space-between', marginBottom: 6 }]}>
        <Selo texto={etapa.nome} cor={etapa.cor} />
        <Text style={estilos.textoSuave}>{processo.area}</Text>
      </View>
      <Text style={estilos.titulo}>{processo.titulo}</Text>
      {!!processo.numero && <Text style={[estilos.textoSuave, { fontVariant: ['tabular-nums'] }]}>{processo.numero}</Text>}
      <Text style={[estilos.textoSuave, { marginTop: 4 }]}>
        {cliente?.nome ?? 'Sem cliente'}
        {processo.parteContraria ? ` × ${processo.parteContraria}` : ''}
      </Text>
      {processo.status === 'arquivado' && (
        <View style={{ marginTop: 6 }}>
          <Selo texto="Arquivado" cor={cores.textoSuave} />
        </View>
      )}
    </Cartao>
  );
}

function Marcador({ marcado, aoPressionar, rotulo }: { marcado: boolean; aoPressionar: () => void; rotulo: string }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: marcado }}
      accessibilityLabel={rotulo}
      hitSlop={10}
      onPress={aoPressionar}
    >
      <Ionicons
        name={marcado ? 'checkmark-circle' : 'ellipse-outline'}
        size={26}
        color={marcado ? cores.sucesso : cores.textoFraco}
      />
    </Pressable>
  );
}

export function CartaoCompromisso({ compromisso, mostrarProcesso = true }: { compromisso: Compromisso; mostrarProcesso?: boolean }) {
  const processo = useDados((s) =>
    compromisso.processoId ? s.processos.find((p) => p.id === compromisso.processoId) : undefined,
  );
  const alternarConcluido = useDados((s) => s.alternarConcluido);
  const tipo = TIPOS_COMPROMISSO[compromisso.tipo];
  const atrasado = !compromisso.concluido && compromisso.data < hojeISO();

  return (
    <Cartao
      aoPressionar={() => router.push(`/compromisso/form?id=${compromisso.id}`)}
      estilo={{ flexDirection: 'row', gap: espaco.md, borderLeftWidth: 4, borderLeftColor: tipo.cor }}
    >
      <Marcador
        marcado={compromisso.concluido}
        rotulo={compromisso.concluido ? 'Marcar como pendente' : 'Marcar como concluído'}
        aoPressionar={() => alternarConcluido(compromisso.id)}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={[estilos.linha, { flexWrap: 'wrap' }]}>
          <Selo texto={tipo.nome} cor={tipo.cor} />
          {compromisso.prioridade === 'alta' && !compromisso.concluido && <Selo texto="Urgente" cor={cores.perigo} />}
          {atrasado && <Selo texto="Atrasado" cor={cores.perigo} />}
        </View>
        <Text
          style={[
            estilos.titulo,
            compromisso.concluido && { textDecorationLine: 'line-through', color: cores.textoFraco },
          ]}
        >
          {compromisso.titulo}
        </Text>
        <Text style={[estilos.textoSuave, atrasado && { color: cores.perigo }]}>
          {formatarData(compromisso.data)}
          {compromisso.hora ? ` às ${compromisso.hora}` : ''} · {descreverDistancia(compromisso.data)}
        </Text>
        {mostrarProcesso && processo && (
          <Text style={estilos.textoSuave} numberOfLines={1}>
            {processo.titulo}
          </Text>
        )}
      </View>
    </Cartao>
  );
}

export function CartaoLancamento({ lancamento }: { lancamento: Lancamento }) {
  const alternarPago = useDados((s) => s.alternarPago);
  const receita = lancamento.tipo === 'receita';
  const vencido = !lancamento.pago && lancamento.vencimento < hojeISO();
  const cor = receita ? cores.sucesso : cores.perigo;

  return (
    <Cartao
      aoPressionar={() => router.push(`/lancamento/form?id=${lancamento.id}`)}
      estilo={{ flexDirection: 'row', gap: espaco.md, alignItems: 'center' }}
    >
      <Marcador
        marcado={lancamento.pago}
        rotulo={lancamento.pago ? 'Marcar como pendente' : receita ? 'Marcar como recebido' : 'Marcar como pago'}
        aoPressionar={() => alternarPago(lancamento.id)}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={estilos.titulo} numberOfLines={2}>
          {lancamento.descricao}
        </Text>
        <Text style={[estilos.textoSuave, vencido && { color: cores.perigo }]}>
          {CATEGORIAS_LANCAMENTO[lancamento.categoria]} · {lancamento.pago ? (receita ? 'Recebido' : 'Pago') : vencido ? 'Vencido' : 'Vence'}{' '}
          {formatarData(lancamento.pago && lancamento.pagoEm ? lancamento.pagoEm : lancamento.vencimento)}
        </Text>
      </View>
      <Text style={{ fontSize: 15, fontWeight: '700', color: cor, fontVariant: ['tabular-nums'] }}>
        {receita ? '+' : '−'} {formatarMoeda(lancamento.valor)}
      </Text>
    </Cartao>
  );
}
