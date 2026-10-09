import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';

import type { NomeIcone } from '../../components/ui';
import { cores } from '../../tema';

const ABAS: { nome: string; titulo: string; icone: NomeIcone }[] = [
  { nome: 'index', titulo: 'Início', icone: 'home-outline' },
  { nome: 'processos', titulo: 'Processos', icone: 'briefcase-outline' },
  { nome: 'agenda', titulo: 'Agenda', icone: 'calendar-outline' },
  { nome: 'clientes', titulo: 'Clientes', icone: 'people-outline' },
  { nome: 'financeiro', titulo: 'Financeiro', icone: 'wallet-outline' },
];

export default function LayoutAbas() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: cores.primaria },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: cores.primaria,
        tabBarInactiveTintColor: cores.textoFraco,
        sceneStyle: { backgroundColor: cores.fundo },
      }}
    >
      {ABAS.map((aba) => (
        <Tabs.Screen
          key={aba.nome}
          name={aba.nome}
          options={{
            title: aba.titulo,
            tabBarLabel: aba.titulo,
            tabBarIcon: ({ color, size }) => <Ionicons name={aba.icone} color={color} size={size} />,
          }}
        />
      ))}
    </Tabs>
  );
}
