import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ComponentProps, type ReactNode } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { hojeISO, formatarData, lerDataBR, mascararData, somarDias } from '../lib/datas';
import { iniciais, normalizarBusca } from '../lib/formatos';
import { cores, espaco, raio, sombra } from '../tema';

export const LIMITE_TEXTO = 300;
export const LIMITE_TEXTO_LONGO = 5000;

export type NomeIcone = ComponentProps<typeof Ionicons>['name'];

export function Tela({ children, rodape }: { children: ReactNode; rodape?: ReactNode }) {
  return (
    <View style={estilos.tela}>
      <ScrollView contentContainerStyle={estilos.telaConteudo} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {rodape}
    </View>
  );
}

export function Cartao({
  children,
  aoPressionar,
  estilo,
}: {
  children: ReactNode;
  aoPressionar?: () => void;
  estilo?: StyleProp<ViewStyle>;
}) {
  if (!aoPressionar) return <View style={[estilos.cartao, estilo]}>{children}</View>;
  return (
    <Pressable
      onPress={aoPressionar}
      style={({ pressed }) => [estilos.cartao, estilo, pressed && { opacity: 0.85 }]}
    >
      {children}
    </Pressable>
  );
}

type VarianteBotao = 'primario' | 'secundario' | 'perigo' | 'texto';

export function Botao({
  titulo,
  aoPressionar,
  variante = 'primario',
  icone,
  desabilitado,
  estilo,
}: {
  titulo: string;
  aoPressionar: () => void;
  variante?: VarianteBotao;
  icone?: NomeIcone;
  desabilitado?: boolean;
  estilo?: StyleProp<ViewStyle>;
}) {
  const corTexto =
    variante === 'primario' ? '#fff' : variante === 'perigo' ? cores.perigo : cores.primaria;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={aoPressionar}
      disabled={desabilitado}
      style={({ pressed }) => [
        estilos.botao,
        estilos[`botao_${variante}`],
        (pressed || desabilitado) && { opacity: 0.6 },
        estilo,
      ]}
    >
      {icone && <Ionicons name={icone} size={18} color={corTexto} />}
      <Text style={[estilos.botaoTexto, { color: corTexto }]}>{titulo}</Text>
    </Pressable>
  );
}

export function BotaoIcone({
  icone,
  aoPressionar,
  cor = cores.primaria,
  rotulo,
}: {
  icone: NomeIcone;
  aoPressionar: () => void;
  cor?: string;
  rotulo: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      hitSlop={8}
      onPress={aoPressionar}
      style={({ pressed }) => [estilos.botaoIcone, pressed && { opacity: 0.5 }]}
    >
      <Ionicons name={icone} size={20} color={cor} />
    </Pressable>
  );
}

export function BotaoFlutuante({ aoPressionar, rotulo }: { aoPressionar: () => void; rotulo: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      onPress={aoPressionar}
      style={({ pressed }) => [estilos.fab, pressed && { opacity: 0.85 }]}
    >
      <Ionicons name="add" size={28} color="#fff" />
    </Pressable>
  );
}

export function Campo({
  rotulo,
  erro,
  dica,
  ...props
}: TextInputProps & { rotulo: string; erro?: string; dica?: string }) {
  return (
    <View style={estilos.campo}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <TextInput
        placeholderTextColor={cores.textoFraco}
        {...props}
        // Limite padrão de tamanho para todo campo de texto do app.
        maxLength={props.maxLength ?? (props.multiline ? LIMITE_TEXTO_LONGO : LIMITE_TEXTO)}
        style={[estilos.entrada, props.multiline && estilos.entradaMultilinha, !!erro && estilos.entradaErro]}
      />
      {erro ? <Text style={estilos.erro}>{erro}</Text> : dica ? <Text style={estilos.dica}>{dica}</Text> : null}
    </View>
  );
}

/** Campo de data em dd/mm/aaaa com atalhos. Recebe e devolve 'YYYY-MM-DD'. */
export function CampoData({
  rotulo,
  valor,
  aoMudar,
  erro,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (iso: string) => void;
  erro?: string;
}) {
  const [texto, setTexto] = useState(formatarData(valor));
  const [valorAnterior, setValorAnterior] = useState(valor);
  // Acompanha mudanças feitas de fora (ex.: calculadora de prazos).
  if (valor !== valorAnterior) {
    setValorAnterior(valor);
    if (valor && valor !== lerDataBR(texto)) setTexto(formatarData(valor));
  }
  const hoje = hojeISO();
  const atalhos = [
    { rotulo: 'Hoje', data: hoje },
    { rotulo: 'Amanhã', data: somarDias(hoje, 1) },
    { rotulo: '+7 dias', data: somarDias(hoje, 7) },
  ];
  const definir = (iso: string) => {
    setTexto(formatarData(iso));
    aoMudar(iso);
  };
  return (
    <View style={estilos.campo}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <TextInput
        value={texto}
        placeholder="dd/mm/aaaa"
        placeholderTextColor={cores.textoFraco}
        keyboardType="number-pad"
        maxLength={10}
        onChangeText={(t) => {
          const mascarado = mascararData(t);
          setTexto(mascarado);
          aoMudar(lerDataBR(mascarado) ?? '');
        }}
        style={[estilos.entrada, !!erro && estilos.entradaErro]}
      />
      <View style={estilos.linhaChips}>
        {atalhos.map((a) => (
          <Chip key={a.rotulo} rotulo={a.rotulo} ativo={valor === a.data} aoPressionar={() => definir(a.data)} />
        ))}
      </View>
      {!!erro && <Text style={estilos.erro}>{erro}</Text>}
    </View>
  );
}

export function Chip({
  rotulo,
  ativo,
  aoPressionar,
  cor = cores.primaria,
}: {
  rotulo: string;
  ativo?: boolean;
  aoPressionar?: () => void;
  cor?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: ativo }}
      onPress={aoPressionar}
      style={[estilos.chip, ativo && { backgroundColor: cor, borderColor: cor }]}
    >
      <Text style={[estilos.chipTexto, ativo && { color: '#fff' }]}>{rotulo}</Text>
    </Pressable>
  );
}

export interface Opcao<T extends string> {
  valor: T;
  rotulo: string;
  cor?: string;
}

/** Escolha única entre poucas opções, em chips. */
export function Seletor<T extends string>({
  rotulo,
  opcoes,
  valor,
  aoMudar,
}: {
  rotulo?: string;
  opcoes: readonly Opcao<T>[];
  valor: T;
  aoMudar: (v: T) => void;
}) {
  return (
    <View style={estilos.campo}>
      {rotulo && <Text style={estilos.rotulo}>{rotulo}</Text>}
      <View style={estilos.linhaChips}>
        {opcoes.map((o) => (
          <Chip key={o.valor} rotulo={o.rotulo} cor={o.cor} ativo={o.valor === valor} aoPressionar={() => aoMudar(o.valor)} />
        ))}
      </View>
    </View>
  );
}

export function Segmentado<T extends string>({
  opcoes,
  valor,
  aoMudar,
}: {
  opcoes: readonly Opcao<T>[];
  valor: T;
  aoMudar: (v: T) => void;
}) {
  return (
    <View style={estilos.segmentado}>
      {opcoes.map((o) => {
        const ativo = o.valor === valor;
        return (
          <Pressable
            key={o.valor}
            accessibilityRole="tab"
            accessibilityState={{ selected: ativo }}
            onPress={() => aoMudar(o.valor)}
            style={[estilos.segmento, ativo && estilos.segmentoAtivo]}
          >
            <Text style={[estilos.segmentoTexto, ativo && estilos.segmentoTextoAtivo]}>{o.rotulo}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Escolha de um registro em lista longa (clientes, processos), com busca. */
export function SeletorRegistro({
  rotulo,
  itens,
  valor,
  aoMudar,
  permitirVazio = true,
  erro,
}: {
  rotulo: string;
  itens: { id: string; titulo: string; subtitulo?: string }[];
  valor?: string;
  aoMudar: (id: string | undefined) => void;
  permitirVazio?: boolean;
  erro?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const selecionado = itens.find((i) => i.id === valor);
  const termo = normalizarBusca(busca);
  const filtrados = termo
    ? itens.filter((i) => normalizarBusca(`${i.titulo} ${i.subtitulo ?? ''}`).includes(termo))
    : itens;
  const escolher = (id: string | undefined) => {
    aoMudar(id);
    setAberto(false);
    setBusca('');
  };

  return (
    <View style={estilos.campo}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => setAberto(true)}
        style={[estilos.entrada, estilos.seletorRegistro, !!erro && estilos.entradaErro]}
      >
        <Text style={{ color: selecionado ? cores.texto : cores.textoFraco, flex: 1 }} numberOfLines={1}>
          {selecionado?.titulo ?? 'Selecionar…'}
        </Text>
        <Ionicons name="chevron-down" size={18} color={cores.textoSuave} />
      </Pressable>
      {!!erro && <Text style={estilos.erro}>{erro}</Text>}

      <Modal visible={aberto} animationType="slide" onRequestClose={() => setAberto(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: cores.fundo }}>
          <View style={estilos.modalCabecalho}>
            <Text style={estilos.modalTitulo}>{rotulo}</Text>
            <BotaoIcone icone="close" rotulo="Fechar" aoPressionar={() => setAberto(false)} />
          </View>
          <View style={{ paddingHorizontal: espaco.lg }}>
            <Busca valor={busca} aoMudar={setBusca} />
          </View>
          <FlatList
            data={filtrados}
            keyExtractor={(i) => i.id}
            contentContainerStyle={{ padding: espaco.lg, gap: espaco.sm }}
            ListHeaderComponent={
              permitirVazio ? (
                <Cartao aoPressionar={() => escolher(undefined)}>
                  <Text style={estilos.textoSuave}>Nenhum</Text>
                </Cartao>
              ) : null
            }
            ListHeaderComponentStyle={{ marginBottom: espaco.sm }}
            renderItem={({ item }) => (
              <Cartao
                aoPressionar={() => escolher(item.id)}
                estilo={item.id === valor && { borderColor: cores.primaria }}
              >
                <Text style={estilos.titulo}>{item.titulo}</Text>
                {!!item.subtitulo && <Text style={estilos.textoSuave}>{item.subtitulo}</Text>}
              </Cartao>
            )}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

export function Busca({ valor, aoMudar, placeholder = 'Buscar' }: { valor: string; aoMudar: (t: string) => void; placeholder?: string }) {
  return (
    <View style={estilos.busca}>
      <Ionicons name="search" size={18} color={cores.textoFraco} />
      <TextInput
        value={valor}
        onChangeText={aoMudar}
        placeholder={placeholder}
        placeholderTextColor={cores.textoFraco}
        style={estilos.buscaEntrada}
        autoCorrect={false}
      />
      {!!valor && <BotaoIcone icone="close-circle" cor={cores.textoFraco} rotulo="Limpar busca" aoPressionar={() => aoMudar('')} />}
    </View>
  );
}

export function Secao({
  titulo,
  acao,
  children,
}: {
  titulo: string;
  acao?: { rotulo: string; aoPressionar: () => void };
  children: ReactNode;
}) {
  return (
    <View style={estilos.secao}>
      <View style={estilos.secaoCabecalho}>
        <Text style={estilos.secaoTitulo}>{titulo}</Text>
        {acao && (
          <Pressable onPress={acao.aoPressionar} hitSlop={8}>
            <Text style={estilos.secaoAcao}>{acao.rotulo}</Text>
          </Pressable>
        )}
      </View>
      <View style={{ gap: espaco.sm }}>{children}</View>
    </View>
  );
}

export function Selo({ texto, cor = cores.primaria, fundo }: { texto: string; cor?: string; fundo?: string }) {
  return (
    <View style={[estilos.selo, { backgroundColor: fundo ?? `${cor}1A` }]}>
      <Text style={[estilos.seloTexto, { color: cor }]}>{texto}</Text>
    </View>
  );
}

export function Vazio({ icone, titulo, texto }: { icone: NomeIcone; titulo: string; texto?: string }) {
  return (
    <View style={estilos.vazio}>
      <Ionicons name={icone} size={36} color={cores.textoFraco} />
      <Text style={estilos.vazioTitulo}>{titulo}</Text>
      {!!texto && <Text style={[estilos.textoSuave, { textAlign: 'center' }]}>{texto}</Text>}
    </View>
  );
}

export function Avatar({ nome, tamanho = 40 }: { nome: string; tamanho?: number }) {
  return (
    <View style={[estilos.avatar, { width: tamanho, height: tamanho, borderRadius: tamanho / 2 }]}>
      <Text style={[estilos.avatarTexto, { fontSize: tamanho * 0.38 }]}>{iniciais(nome)}</Text>
    </View>
  );
}

export function LinhaInfo({ rotulo, valor }: { rotulo: string; valor?: string }) {
  if (!valor) return null;
  return (
    <View style={estilos.linhaInfo}>
      <Text style={estilos.linhaInfoRotulo}>{rotulo}</Text>
      <Text style={estilos.linhaInfoValor} selectable>
        {valor}
      </Text>
    </View>
  );
}

/** Interruptor com rótulo e explicação. */
export function Alternar({
  rotulo,
  dica,
  valor,
  aoMudar,
}: {
  rotulo: string;
  dica?: string;
  valor: boolean;
  aoMudar: (v: boolean) => void;
}) {
  return (
    <View style={estilos.alternar}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={estilos.texto}>{rotulo}</Text>
        {!!dica && <Text style={estilos.dica}>{dica}</Text>}
      </View>
      <Switch
        value={valor}
        onValueChange={aoMudar}
        accessibilityLabel={rotulo}
        trackColor={{ true: cores.primaria, false: cores.borda }}
      />
    </View>
  );
}

/** Mensagem de sucesso ou erro depois de uma ação. */
export function Aviso({ tipo, mensagem }: { tipo: 'ok' | 'erro'; mensagem: string }) {
  const cor = tipo === 'ok' ? cores.sucesso : cores.perigo;
  return (
    <View style={[estilos.aviso, { backgroundColor: tipo === 'ok' ? cores.sucessoClaro : cores.perigoClaro }]}>
      <Ionicons name={tipo === 'ok' ? 'checkmark-circle' : 'alert-circle'} size={20} color={cor} />
      <Text style={{ flex: 1, color: cor }}>{mensagem}</Text>
    </View>
  );
}

export const estilos = StyleSheet.create({
  alternar: { flexDirection: 'row', alignItems: 'center', gap: espaco.md },
  aviso: { flexDirection: 'row', gap: espaco.sm, alignItems: 'center', padding: espaco.md, borderRadius: raio.md },
  tela: { flex: 1, backgroundColor: cores.fundo },
  telaConteudo: { padding: espaco.lg, paddingBottom: 96, gap: espaco.lg },
  cartao: {
    backgroundColor: cores.superficie,
    borderRadius: raio.lg,
    borderWidth: 1,
    borderColor: cores.borda,
    padding: espaco.lg,
    ...sombra,
  },
  titulo: { fontSize: 16, fontWeight: '600', color: cores.texto },
  texto: { fontSize: 14, color: cores.texto, lineHeight: 20 },
  textoSuave: { fontSize: 13, color: cores.textoSuave, lineHeight: 18 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: espaco.sm },
  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaco.sm,
    paddingVertical: 12,
    paddingHorizontal: espaco.lg,
    borderRadius: raio.md,
  },
  botao_primario: { backgroundColor: cores.primaria },
  botao_secundario: { backgroundColor: cores.primariaClara },
  botao_perigo: { backgroundColor: cores.perigoClaro },
  botao_texto: { backgroundColor: 'transparent' },
  botaoTexto: { fontSize: 15, fontWeight: '600' },
  botaoIcone: { padding: 4 },
  fab: {
    position: 'absolute',
    right: espaco.xl,
    bottom: espaco.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: cores.primaria,
    alignItems: 'center',
    justifyContent: 'center',
    ...sombra,
    shadowOpacity: 0.2,
    elevation: 6,
  },
  campo: { gap: 6 },
  rotulo: { fontSize: 13, fontWeight: '600', color: cores.textoSuave },
  entrada: {
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.md,
    paddingHorizontal: espaco.md,
    paddingVertical: 11,
    fontSize: 15,
    color: cores.texto,
  },
  entradaMultilinha: { minHeight: 88, textAlignVertical: 'top' },
  entradaErro: { borderColor: cores.perigo },
  erro: { fontSize: 12, color: cores.perigo },
  dica: { fontSize: 12, color: cores.textoFraco },
  seletorRegistro: { flexDirection: 'row', alignItems: 'center', gap: espaco.sm },
  linhaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.sm },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: espaco.md,
    borderRadius: raio.pill,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
  },
  chipTexto: { fontSize: 13, color: cores.texto, fontWeight: '500' },
  segmentado: {
    flexDirection: 'row',
    backgroundColor: cores.borda,
    borderRadius: raio.md,
    padding: 3,
  },
  segmento: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: raio.sm },
  segmentoAtivo: { backgroundColor: cores.superficie, ...sombra },
  segmentoTexto: { fontSize: 13, fontWeight: '600', color: cores.textoSuave },
  segmentoTextoAtivo: { color: cores.primaria },
  busca: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.md,
    paddingHorizontal: espaco.md,
  },
  buscaEntrada: { flex: 1, paddingVertical: 10, fontSize: 15, color: cores.texto },
  secao: { gap: espaco.sm },
  secaoCabecalho: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  secaoTitulo: {
    fontSize: 13,
    fontWeight: '700',
    color: cores.textoSuave,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  secaoAcao: { fontSize: 14, fontWeight: '600', color: cores.primaria },
  selo: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: raio.pill },
  seloTexto: { fontSize: 11, fontWeight: '700' },
  vazio: { alignItems: 'center', paddingVertical: espaco.xl, gap: espaco.sm },
  vazioTitulo: { fontSize: 15, fontWeight: '600', color: cores.textoSuave },
  avatar: { backgroundColor: cores.primariaClara, alignItems: 'center', justifyContent: 'center' },
  avatarTexto: { color: cores.primaria, fontWeight: '700' },
  linhaInfo: { gap: 2 },
  linhaInfoRotulo: { fontSize: 12, color: cores.textoFraco },
  linhaInfoValor: { fontSize: 15, color: cores.texto },
  modalCabecalho: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: espaco.lg,
  },
  modalTitulo: { fontSize: 18, fontWeight: '700', color: cores.texto },
});
