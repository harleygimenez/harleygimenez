import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Aviso, Avatar, Botao, BotaoIcone, Campo, Cartao, Secao, Segmentado, Selo, Tela, Vazio, estilos } from '../components/ui';
import { PAPEIS, useNuvem, type Convite, type EscritorioDoUsuario, type Membro, type ModoEntrada, type Papel } from '../data/nuvem';
import { formatarOab } from '../lib/advogados';
import { confirmar } from '../lib/confirmar';
import { diaDoInstante, formatarData } from '../lib/datas';
import { PROVEDORES_LOGIN, validarConfigNuvem, type ProvedorLogin } from '../lib/nuvem';
import { cores, espaco } from '../tema';

type Mensagem = { tipo: 'ok' | 'erro'; mensagem: string } | null;

const OPCOES_PAPEL = (Object.keys(PAPEIS) as Papel[]).map((p) => ({ valor: p, rotulo: PAPEIS[p] }));

function formatarInstante(instante: string): string {
  if (!instante) return 'nunca';
  const d = new Date(instante);
  return `${formatarData(diaDoInstante(instante))} às ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Servidor do escritório (projeto Supabase). */
function SecaoServidor({ aberta }: { aberta: boolean }) {
  const config = useNuvem((s) => s.config);
  const salvarConfig = useNuvem((s) => s.salvarConfig);
  const [url, setUrl] = useState(config.url);
  const [chave, setChave] = useState(config.chavePublica);
  const [mostrar, setMostrar] = useState(aberta);
  const [erro, setErro] = useState<string | null>(null);

  if (!mostrar) {
    return <Botao titulo="Servidor do escritório" icone="server-outline" variante="texto" aoPressionar={() => setMostrar(true)} />;
  }
  return (
    <Secao titulo="Servidor do escritório">
      <Cartao estilo={{ gap: espaco.md }}>
        <Text style={estilos.textoSuave}>
          O login e a equipe usam um projeto gratuito do Supabase do próprio escritório. O passo a passo está em
          nuvem/README.md no código do OpenJus. Sem servidor, o app funciona normalmente só neste aparelho.
        </Text>
        <Campo
          rotulo="Endereço do projeto"
          value={url}
          onChangeText={setUrl}
          placeholder="https://abcd.supabase.co"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Campo
          rotulo="Chave pública (anon ou publishable)"
          value={chave}
          onChangeText={setChave}
          autoCapitalize="none"
          autoCorrect={false}
          dica="É pública por definição: os dados são protegidos pelas regras de acesso (RLS) do banco."
          erro={erro ?? undefined}
        />
        <Botao
          titulo="Salvar servidor"
          icone="checkmark"
          variante="secundario"
          aoPressionar={() => {
            const novo = { url, chavePublica: chave };
            const invalida = validarConfigNuvem(novo);
            setErro(invalida);
            if (!invalida) salvarConfig(novo);
          }}
        />
      </Cartao>
    </Secao>
  );
}

function Entrar() {
  const entrar = useNuvem((s) => s.entrar);
  const [entrando, setEntrando] = useState<ProvedorLogin | null>(null);
  const [mensagem, setMensagem] = useState<Mensagem>(null);

  async function com(provedor: ProvedorLogin) {
    setEntrando(provedor);
    setMensagem(null);
    try {
      await entrar(provedor);
    } catch (e) {
      setMensagem({ tipo: 'erro', mensagem: (e as Error).message });
    } finally {
      setEntrando(null);
    }
  }

  return (
    <Secao titulo="Entrar">
      <Cartao estilo={{ gap: espaco.md }}>
        <Text style={estilos.textoSuave}>
          Entre com a conta do escritório para usar os mesmos clientes, processos e prazos em vários celulares e com vários
          advogados. O OpenJus não vê nem guarda a sua senha.
        </Text>
        {(Object.keys(PROVEDORES_LOGIN) as ProvedorLogin[]).map((p) => (
          <Botao
            key={p}
            titulo={entrando === p ? 'Abrindo…' : `Entrar com ${PROVEDORES_LOGIN[p]}`}
            icone={p === 'google' ? 'logo-google' : 'logo-microsoft'}
            variante={p === 'google' ? 'primario' : 'secundario'}
            desabilitado={!!entrando}
            aoPressionar={() => com(p)}
          />
        ))}
        {mensagem && <Aviso {...mensagem} />}
      </Cartao>
    </Secao>
  );
}

function EscolherEscritorio() {
  const { listarEscritorios, criarEscritorio, escolherEscritorio } = useNuvem(
    useShallow((s) => ({ listarEscritorios: s.listarEscritorios, criarEscritorio: s.criarEscritorio, escolherEscritorio: s.escolherEscritorio })),
  );
  const [escritorios, setEscritorios] = useState<EscritorioDoUsuario[] | null>(null);
  const [escolhido, setEscolhido] = useState<EscritorioDoUsuario | null>(null);
  const [nome, setNome] = useState('');
  const [mensagem, setMensagem] = useState<Mensagem>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let ativo = true;
    listarEscritorios()
      .then((lista) => ativo && setEscritorios(lista))
      .catch((e: Error) => ativo && setMensagem({ tipo: 'erro', mensagem: e.message }));
    return () => {
      ativo = false;
    };
  }, [listarEscritorios]);

  async function usar(e: EscritorioDoUsuario, modo: ModoEntrada) {
    setOcupado(true);
    setMensagem(null);
    try {
      await escolherEscritorio(e, modo);
    } catch (erro) {
      setMensagem({ tipo: 'erro', mensagem: (erro as Error).message });
    } finally {
      setOcupado(false);
    }
  }

  async function criar() {
    setOcupado(true);
    setMensagem(null);
    try {
      const e = await criarEscritorio(nome);
      // Escritório novo: os dados deste aparelho viram os dados do escritório.
      await escolherEscritorio(e, 'juntar');
    } catch (erro) {
      setMensagem({ tipo: 'erro', mensagem: (erro as Error).message });
    } finally {
      setOcupado(false);
    }
  }

  if (escolhido) {
    return (
      <Secao titulo={escolhido.nome}>
        <Cartao estilo={{ gap: espaco.md }}>
          <Text style={estilos.texto}>O que fazer com os dados que já estão neste aparelho?</Text>
          <Botao
            titulo="Juntar com os dados do escritório"
            icone="git-merge-outline"
            desabilitado={ocupado}
            aoPressionar={() => usar(escolhido, 'juntar')}
          />
          <Botao
            titulo="Usar só os dados do escritório"
            icone="cloud-download-outline"
            variante="secundario"
            desabilitado={ocupado}
            aoPressionar={() =>
              confirmar(
                'Usar só os dados do escritório?',
                'Clientes, processos e prazos que existem só neste aparelho serão descartados.',
                () => void usar(escolhido, 'usar-do-escritorio'),
                'Usar do escritório',
              )
            }
          />
          <Botao titulo="Voltar" variante="texto" aoPressionar={() => setEscolhido(null)} />
          {ocupado && <ActivityIndicator color={cores.primaria} />}
          {mensagem && <Aviso {...mensagem} />}
        </Cartao>
      </Secao>
    );
  }

  return (
    <>
      <Secao titulo="Seus escritórios">
        {escritorios === null && !mensagem && <ActivityIndicator color={cores.primaria} />}
        {escritorios?.length === 0 && (
          <Vazio icone="business-outline" titulo="Nenhum escritório" texto="Crie um abaixo ou peça um convite ao administrador." />
        )}
        {escritorios?.map((e) => (
          <Cartao key={e.id} estilo={[estilos.linha, { gap: espaco.md }]} aoPressionar={() => setEscolhido(e)}>
            <Avatar nome={e.nome} />
            <View style={{ flex: 1 }}>
              <Text style={estilos.titulo}>{e.nome}</Text>
              <Text style={estilos.textoSuave}>{PAPEIS[e.papel]}</Text>
            </View>
          </Cartao>
        ))}
      </Secao>
      <Secao titulo="Criar escritório">
        <Cartao estilo={{ gap: espaco.md }}>
          <Campo rotulo="Nome do escritório" value={nome} onChangeText={setNome} placeholder="Ex.: Gimenez Advocacia" />
          <Botao titulo="Criar e enviar meus dados" icone="add" desabilitado={!nome.trim() || ocupado} aoPressionar={criar} />
        </Cartao>
      </Secao>
      {mensagem && <Aviso {...mensagem} />}
    </>
  );
}

function Escritorio() {
  const nuvem = useNuvem(
    useShallow((s) => ({
      escritorio: s.escritorio,
      sessao: s.sessao,
      sincronizando: s.sincronizando,
      ultimaSincronizacao: s.ultimaSincronizacao,
      erro: s.erro,
      sincronizar: s.sincronizar,
      listarMembros: s.listarMembros,
      listarConvites: s.listarConvites,
      convidar: s.convidar,
      cancelarConvite: s.cancelarConvite,
      removerMembro: s.removerMembro,
      compartilharIntegracoes: s.compartilharIntegracoes,
      deixarEscritorio: s.deixarEscritorio,
    })),
  );
  const [membros, setMembros] = useState<Membro[]>([]);
  const [convites, setConvites] = useState<Convite[]>([]);
  const [email, setEmail] = useState('');
  const [papel, setPapel] = useState<Papel>('advogado');
  const [mensagem, setMensagem] = useState<Mensagem>(null);
  const admin = nuvem.escritorio?.papel === 'admin';
  const { listarMembros, listarConvites } = nuvem;

  const carregar = useCallback(async () => {
    try {
      const [m, c] = await Promise.all([listarMembros(), admin ? listarConvites() : Promise.resolve([])]);
      setMembros(m);
      setConvites(c);
    } catch (e) {
      setMensagem({ tipo: 'erro', mensagem: (e as Error).message });
    }
  }, [admin, listarMembros, listarConvites]);

  useEffect(() => {
    let ativo = true;
    Promise.all([listarMembros(), admin ? listarConvites() : Promise.resolve([])])
      .then(([m, c]) => {
        if (!ativo) return;
        setMembros(m);
        setConvites(c);
      })
      .catch((e: Error) => ativo && setMensagem({ tipo: 'erro', mensagem: e.message }));
    return () => {
      ativo = false;
    };
  }, [admin, listarMembros, listarConvites]);

  async function executar(acao: () => Promise<unknown>, sucesso: string) {
    setMensagem(null);
    try {
      await acao();
      setMensagem({ tipo: 'ok', mensagem: sucesso });
      await carregar();
    } catch (e) {
      setMensagem({ tipo: 'erro', mensagem: (e as Error).message });
    }
  }

  if (!nuvem.escritorio) return null;
  const emailValido = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  return (
    <>
      <Secao titulo="Escritório">
        <Cartao estilo={{ gap: espaco.md }}>
          <View style={estilos.linha}>
            <Text style={[estilos.titulo, { flex: 1 }]}>{nuvem.escritorio.nome}</Text>
            <Selo texto={PAPEIS[nuvem.escritorio.papel]} />
          </View>
          <Text style={estilos.textoSuave}>
            Os dados são sincronizados automaticamente entre os aparelhos da equipe. Última sincronização:{' '}
            {formatarInstante(nuvem.ultimaSincronizacao)}.
          </Text>
          {nuvem.sincronizando ? (
            <ActivityIndicator color={cores.primaria} />
          ) : (
            <Botao
              titulo="Sincronizar agora"
              icone="sync-outline"
              variante="secundario"
              aoPressionar={() => executar(() => nuvem.sincronizar(), 'Dados sincronizados.')}
            />
          )}
          {!!nuvem.erro && <Aviso tipo="erro" mensagem={nuvem.erro} />}
        </Cartao>
      </Secao>

      {mensagem && <Aviso {...mensagem} />}

      <Secao titulo={`Equipe (${membros.length})`}>
        {membros.map((m) => (
          <Cartao key={m.usuario_id} estilo={[estilos.linha, { gap: espaco.md }]}>
            <Avatar nome={m.nome || m.email} />
            <View style={{ flex: 1 }}>
              <Text style={estilos.titulo}>
                {m.nome || m.email}
                {m.usuario_id === nuvem.sessao?.usuario.id ? ' (você)' : ''}
              </Text>
              <Text style={estilos.textoSuave}>
                {[PAPEIS[m.papel], m.oab && m.uf_oab ? formatarOab({ oab: m.oab, uf: m.uf_oab }) : '', m.email].filter(Boolean).join(' · ')}
              </Text>
            </View>
            {admin && m.usuario_id !== nuvem.sessao?.usuario.id && (
              <BotaoIcone
                icone="person-remove-outline"
                cor={cores.perigo}
                rotulo={`Remover ${m.nome || m.email}`}
                aoPressionar={() =>
                  confirmar(
                    'Remover da equipe?',
                    `${m.nome || m.email} perde o acesso aos dados do escritório.`,
                    () => void executar(() => nuvem.removerMembro(m.usuario_id), 'Removido da equipe.'),
                    'Remover',
                  )
                }
              />
            )}
          </Cartao>
        ))}
      </Secao>

      {admin && (
        <Secao titulo="Convidar advogado">
          <Cartao estilo={{ gap: espaco.md }}>
            <Text style={estilos.textoSuave}>
              A pessoa entra com a conta Google ou Microsoft deste e-mail e passa a ver os dados do escritório.
            </Text>
            <Campo rotulo="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            <Segmentado opcoes={OPCOES_PAPEL} valor={papel} aoMudar={setPapel} />
            <Botao
              titulo="Enviar convite"
              icone="mail-outline"
              desabilitado={!emailValido}
              aoPressionar={() =>
                executar(async () => {
                  await nuvem.convidar(email, papel);
                  setEmail('');
                }, 'Convite criado. Avise a pessoa para entrar no OpenJus com esse e-mail.')
              }
            />
            {convites.map((c) => (
              <View key={c.id} style={estilos.linha}>
                <Text style={[estilos.texto, { flex: 1 }]}>
                  {c.email} · {PAPEIS[c.papel]} · até {formatarData(diaDoInstante(c.expira_em))}
                </Text>
                <BotaoIcone
                  icone="close-circle-outline"
                  cor={cores.perigo}
                  rotulo={`Cancelar convite de ${c.email}`}
                  aoPressionar={() => executar(() => nuvem.cancelarConvite(c.id), 'Convite cancelado.')}
                />
              </View>
            ))}
          </Cartao>
        </Secao>
      )}

      {admin && (
        <Secao titulo="Integrações da equipe">
          <Cartao estilo={{ gap: espaco.md }}>
            <Text style={estilos.textoSuave}>
              Envia para a equipe os webhooks do n8n e as pastas do Google Drive/OneDrive configurados neste aparelho. Assim,
              cada advogado só entra com a conta e já tem acesso às pastas do escritório.
            </Text>
            <Botao
              titulo="Compartilhar integrações"
              icone="share-social-outline"
              variante="secundario"
              aoPressionar={() => executar(() => nuvem.compartilharIntegracoes(), 'Integrações compartilhadas com a equipe.')}
            />
          </Cartao>
        </Secao>
      )}

      <Botao
        titulo="Trocar de escritório"
        icone="swap-horizontal-outline"
        variante="texto"
        aoPressionar={() =>
          confirmar('Trocar de escritório?', 'Os dados continuam neste aparelho e no escritório.', () => nuvem.deixarEscritorio(), 'Trocar')
        }
      />
    </>
  );
}

/** Login com Google ou Microsoft, escritório compartilhado e equipe. */
export default function Conta() {
  const { config, sessao, escritorio, iniciada, sair } = useNuvem(
    useShallow((s) => ({ config: s.config, sessao: s.sessao, escritorio: s.escritorio, iniciada: s.iniciada, sair: s.sair })),
  );
  const configurado = !validarConfigNuvem(config);

  return (
    <Tela>
      {!configurado && <SecaoServidor aberta />}
      {configurado && !iniciada && <ActivityIndicator color={cores.primaria} />}
      {configurado && iniciada && !sessao && <Entrar />}
      {sessao && (
        <Cartao estilo={[estilos.linha, { gap: espaco.md }]}>
          <Avatar nome={sessao.usuario.nome || sessao.usuario.email} />
          <View style={{ flex: 1 }}>
            <Text style={estilos.titulo}>{sessao.usuario.nome || 'Conectado'}</Text>
            <Text style={estilos.textoSuave}>{sessao.usuario.email}</Text>
          </View>
          <Botao
            titulo="Sair"
            variante="texto"
            aoPressionar={() =>
              confirmar('Sair da conta?', 'Os dados continuam neste aparelho, mas param de sincronizar.', () => void sair(), 'Sair')
            }
          />
        </Cartao>
      )}
      {sessao && !escritorio && <EscolherEscritorio />}
      {sessao && escritorio && <Escritorio />}
      {configurado && <SecaoServidor aberta={false} />}
    </Tela>
  );
}
