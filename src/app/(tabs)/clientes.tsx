import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';

import { Avatar, BotaoFlutuante, Busca, Cartao, Vazio, estilos } from '../../components/ui';
import { useDados } from '../../data/store';
import { normalizarBusca } from '../../lib/formatos';
import { cores, espaco } from '../../tema';

export default function Clientes() {
  const clientes = useDados((s) => s.clientes);
  const processos = useDados((s) => s.processos);
  const [busca, setBusca] = useState('');

  const contagem = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const p of processos) mapa.set(p.clienteId, (mapa.get(p.clienteId) ?? 0) + 1);
    return mapa;
  }, [processos]);

  const filtrados = useMemo(() => {
    const t = normalizarBusca(busca.trim());
    return clientes
      .filter((c) => !t || normalizarBusca(`${c.nome} ${c.documento} ${c.email} ${c.telefone}`).includes(t))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [clientes, busca]);

  return (
    <View style={estilos.tela}>
      <View style={{ padding: espaco.lg, paddingBottom: 0 }}>
        <Busca valor={busca} aoMudar={setBusca} placeholder="Nome, CPF/CNPJ, e-mail, telefone…" />
      </View>
      <FlatList
        data={filtrados}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: espaco.lg, gap: espaco.sm, paddingBottom: 96 }}
        renderItem={({ item }) => {
          const n = contagem.get(item.id) ?? 0;
          return (
            <Cartao
              aoPressionar={() => router.push(`/cliente/${item.id}`)}
              estilo={{ flexDirection: 'row', alignItems: 'center', gap: espaco.md }}
            >
              <Avatar nome={item.nome} />
              <View style={{ flex: 1 }}>
                <Text style={estilos.titulo}>{item.nome}</Text>
                <Text style={estilos.textoSuave}>
                  {item.tipo === 'PJ' ? 'Pessoa jurídica' : 'Pessoa física'} · {n} {n === 1 ? 'processo' : 'processos'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={cores.textoFraco} />
            </Cartao>
          );
        }}
        ListEmptyComponent={
          <Vazio
            icone="people-outline"
            titulo={busca ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
            texto={busca ? undefined : 'Toque em + para cadastrar.'}
          />
        }
      />
      <BotaoFlutuante rotulo="Novo cliente" aoPressionar={() => router.push('/cliente/form')} />
    </View>
  );
}
