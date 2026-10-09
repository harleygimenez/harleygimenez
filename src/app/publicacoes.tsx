import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Alternar, Aviso, Botao, Cartao, Chip, Secao, Segmentado, Selo, Tela, Vazio, estilos } from '../components/ui';
import { agruparPorProcesso, sugerirCliente, type ProcessoDoDiario } from '../data/importacao';
import { useDados } from '../data/store';
import { advogadosParaBusca, formatarOab } from '../lib/advogados';
import { mascararCnj } from '../lib/cnj';
import { formatarData, hojeISO, somarDias } from '../lib/datas';
import { consultarPublicacoes, type Publicacao } from '../lib/djen';
import { cores, espaco } from '../tema';

const PERIODOS = [
  { valor: '7', rotulo: '7 dias' },
  { valor: '15', rotulo: '15 dias' },
  { valor: '30', rotulo: '30 dias' },
] as const;
type Periodo = (typeof PERIODOS)[number]['valor'];

type Escolha = { incluir: boolean; cliente: string };
type Mensagem = { tipo: 'ok' | 'erro'; mensagem: string };

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function CartaoProcesso({
  processo,
  cadastrado,
  escolha,
  aoMudar,
}: {
  processo: ProcessoDoDiario;
  cadastrado: boolean;
  escolha: Escolha;
  aoMudar: (e: Escolha) => void;
}) {
  const ultima = processo.publicacoes[0];
  return (
    <Cartao estilo={{ gap: espaco.sm }}>
      <View style={estilos.linha}>
        <Text style={[estilos.titulo, { flex: 1 }]} selectable>
          {mascararCnj(processo.numero)}
        </Text>
        {cadastrado ? <Selo texto="Já cadastrado" cor={cores.sucesso} /> : <Selo texto="Novo" />}
      </View>
      <Text style={estilos.textoSuave}>
        {[processo.classe, processo.orgao, processo.tribunal].filter(Boolean).join(' · ')}
      </Text>
      <Text style={estilos.texto}>
        {plural(processo.publicacoes.length, 'publicação', 'publicações')} · última em{' '}
        {formatarData(ultima.dataDisponibilizacao)} ({[ultima.tipoComunicacao, ultima.tipoDocumento].filter(Boolean).join(' · ')})
      </Text>
      {!!ultima.texto && (
        <Text style={estilos.textoSuave} numberOfLines={3}>
          {ultima.texto}
        </Text>
      )}
      {!cadastrado && processo.partes.length > 0 && (
        <View style={{ gap: espaco.xs }}>
          <Text style={estilos.rotulo}>Quem é o cliente?</Text>
          <View style={estilos.linhaChips}>
            {processo.partes.map((p) => (
              <Chip
                key={p.nome}
                rotulo={`${p.nome}${p.polo === 'A' ? ' (autor)' : p.polo === 'P' ? ' (réu)' : ''}`}
                ativo={escolha.cliente === p.nome}
                aoPressionar={() => aoMudar({ ...escolha, cliente: escolha.cliente === p.nome ? '' : p.nome })}
              />
            ))}
          </View>
        </View>
      )}
      <Alternar
        rotulo={cadastrado ? 'Importar publicações e prazos' : 'Cadastrar e importar'}
        valor={escolha.incluir}
        aoMudar={(incluir) => aoMudar({ ...escolha, incluir })}
      />
    </Cartao>
  );
}

/** Busca no Diário de Justiça Eletrônico Nacional as publicações das OABs do escritório. */
export default function Publicacoes() {
  const { perfil, equipe, processos } = useDados(useShallow((s) => ({ perfil: s.perfil, equipe: s.equipe, processos: s.processos })));
  const importarDoDiario = useDados((s) => s.importarDoDiario);
  const advogados = advogadosParaBusca(perfil, equipe);

  const [periodo, setPeriodo] = useState<Periodo>('15');
  const [buscando, setBuscando] = useState(false);
  const [encontrados, setEncontrados] = useState<ProcessoDoDiario[] | null>(null);
  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>({});
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);

  const cadastrados = new Set(processos.map((p) => p.numero.replace(/\D/g, '')));

  async function buscar() {
    setBuscando(true);
    setMensagens([]);
    setEncontrados(null);
    const hoje = hojeISO();
    const filtroData = { dataInicio: somarDias(hoje, -Number(periodo)), dataFim: hoje };
    const todas: Publicacao[] = [];
    const erros: Mensagem[] = [];
    // Uma OAB por vez: a API do CNJ limita as consultas por minuto.
    for (const a of advogados) {
      try {
        todas.push(...(await consultarPublicacoes({ numeroOab: a.oab, ufOab: a.uf, ...filtroData })));
      } catch (e) {
        erros.push({ tipo: 'erro', mensagem: `${formatarOab(a)}: ${(e as Error).message}` });
      }
    }
    const vistas = new Set<string>();
    const grupos = agruparPorProcesso(todas.filter((p) => !vistas.has(p.chave) && vistas.add(p.chave)));
    const nomes = advogados.map((a) => a.nome);
    setEscolhas(Object.fromEntries(grupos.map((g) => [g.numero, { incluir: true, cliente: sugerirCliente(g, nomes) }])));
    setEncontrados(grupos);
    setMensagens(erros);
    setBuscando(false);
  }

  function importar() {
    if (!encontrados) return;
    const itens = encontrados
      .filter((g) => escolhas[g.numero]?.incluir)
      .map((g) => ({ processo: g, clienteNome: escolhas[g.numero]?.cliente ?? '' }));
    const r = importarDoDiario(itens);
    setMensagens([
      {
        tipo: 'ok',
        mensagem:
          `${plural(r.processosNovos, 'processo novo', 'processos novos')}, ${plural(r.clientesNovos, 'cliente novo', 'clientes novos')}, ` +
          `${plural(r.andamentos, 'publicação importada', 'publicações importadas')} e ${plural(r.prazos, 'prazo criado', 'prazos criados')} na agenda.`,
      },
    ]);
    setEncontrados(null);
  }

  if (advogados.length === 0) {
    return (
      <Tela>
        <Vazio
          icone="newspaper-outline"
          titulo="Informe a OAB"
          texto="Cadastre a sua OAB (ex.: OAB/ES 12.345) e a dos advogados do escritório para buscar as publicações no Diário."
        />
        <Botao titulo="Meus dados e OAB" icone="person-outline" aoPressionar={() => router.push('/integracoes')} />
        <Botao titulo="Equipe do escritório" icone="people-outline" variante="secundario" aoPressionar={() => router.push('/equipe')} />
      </Tela>
    );
  }

  const selecionados = encontrados?.filter((g) => escolhas[g.numero]?.incluir).length ?? 0;

  return (
    <Tela
      rodape={
        encontrados && encontrados.length > 0 ? (
          <View style={s.rodape}>
            <Botao
              titulo={`Importar ${plural(selecionados, 'processo', 'processos')}`}
              icone="download-outline"
              desabilitado={selecionados === 0}
              aoPressionar={importar}
            />
          </View>
        ) : undefined
      }
    >
      <Secao titulo="Buscar no Diário de Justiça (DJEN)">
        <Cartao estilo={{ gap: espaco.md }}>
          <Text style={estilos.textoSuave}>
            {advogados.map(formatarOab).join(' · ')}
          </Text>
          <Segmentado opcoes={PERIODOS} valor={periodo} aoMudar={setPeriodo} />
          {buscando ? (
            <View style={s.carregando}>
              <ActivityIndicator color={cores.primaria} />
              <Text style={estilos.textoSuave}>Consultando o Diário…</Text>
            </View>
          ) : (
            <Botao titulo="Buscar publicações" icone="search-outline" aoPressionar={buscar} />
          )}
          <Text style={estilos.dica}>
            Processos novos são cadastrados com o cliente escolhido. As publicações entram na timeline com o inteiro teor e
            os prazos abertos vão para a agenda. Confira sempre os prazos no processo.
          </Text>
        </Cartao>
      </Secao>

      {mensagens.map((m) => (
        <Aviso key={m.mensagem} tipo={m.tipo} mensagem={m.mensagem} />
      ))}

      {encontrados && encontrados.length === 0 && (
        <Vazio icone="checkmark-done-outline" titulo="Nenhuma publicação no período" />
      )}
      {encontrados &&
        encontrados.map((g) => (
          <CartaoProcesso
            key={g.numero}
            processo={g}
            cadastrado={cadastrados.has(g.numero)}
            escolha={escolhas[g.numero] ?? { incluir: true, cliente: '' }}
            aoMudar={(e) => setEscolhas({ ...escolhas, [g.numero]: e })}
          />
        ))}
    </Tela>
  );
}

const s = StyleSheet.create({
  carregando: { flexDirection: 'row', gap: espaco.sm, alignItems: 'center', justifyContent: 'center' },
  rodape: { padding: espaco.lg, backgroundColor: cores.superficie, borderTopWidth: 1, borderTopColor: cores.borda },
});
