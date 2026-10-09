import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Avatar, Botao, BotaoIcone, Campo, Cartao, Secao, Tela, Vazio, estilos } from '../components/ui';
import { useDados } from '../data/store';
import { formatarOab } from '../lib/advogados';
import { confirmar } from '../lib/confirmar';
import { lerOab } from '../lib/djen';
import { cores, espaco } from '../tema';

/** Advogados do escritório: as OABs entram na busca de publicações no Diário. */
export default function Equipe() {
  const perfil = useDados((s) => s.perfil);
  const equipe = useDados((s) => s.equipe);
  const salvarAdvogado = useDados((s) => s.salvarAdvogado);
  const excluirAdvogado = useDados((s) => s.excluirAdvogado);

  const [nome, setNome] = useState('');
  const [oab, setOab] = useState('');
  const [email, setEmail] = useState('');
  const [erro, setErro] = useState<string | undefined>();

  const titular = lerOab(perfil.oab);

  function adicionar() {
    const inscricao = lerOab(oab);
    if (!nome.trim()) return setErro(undefined);
    if (!inscricao) return setErro('Informe o número e a UF, como 12.345/ES.');
    if (equipe.some((a) => a.oab === inscricao.numero && a.uf === inscricao.uf)) return setErro('Esta OAB já está na equipe.');
    salvarAdvogado({ nome: nome.trim(), oab: inscricao.numero, uf: inscricao.uf, email: email.trim() });
    setNome('');
    setOab('');
    setEmail('');
    setErro(undefined);
  }

  return (
    <Tela>
      <Text style={estilos.textoSuave}>
        Cadastre os advogados do escritório para buscar as publicações de todos no Diário de Justiça. Para que cada um use o
        app no próprio celular com os mesmos dados, entre com a conta do escritório em Ajustes › Conta e escritório.
      </Text>

      <Secao titulo="Titular">
        <Cartao estilo={[estilos.linha, { gap: espaco.md }]} aoPressionar={() => router.push('/integracoes')}>
          <Avatar nome={perfil.nome || 'Você'} />
          <View style={{ flex: 1 }}>
            <Text style={estilos.titulo}>{perfil.nome || 'Você'}</Text>
            <Text style={estilos.textoSuave}>
              {titular ? formatarOab({ oab: titular.numero, uf: titular.uf }) : 'Toque para informar a sua OAB'}
            </Text>
          </View>
        </Cartao>
      </Secao>

      <Secao titulo={`Equipe (${equipe.length})`}>
        {equipe.length === 0 && <Vazio icone="people-outline" titulo="Nenhum outro advogado" />}
        {equipe.map((a) => (
          <Cartao key={a.id} estilo={[estilos.linha, { gap: espaco.md }]}>
            <Avatar nome={a.nome} />
            <View style={{ flex: 1 }}>
              <Text style={estilos.titulo}>{a.nome}</Text>
              <Text style={estilos.textoSuave}>
                {formatarOab(a)}
                {a.email ? ` · ${a.email}` : ''}
              </Text>
            </View>
            <BotaoIcone
              icone="trash-outline"
              cor={cores.perigo}
              rotulo={`Remover ${a.nome}`}
              aoPressionar={() => confirmar('Remover advogado?', `${a.nome} sai da equipe.`, () => excluirAdvogado(a.id), 'Remover')}
            />
          </Cartao>
        ))}
      </Secao>

      <Secao titulo="Adicionar advogado">
        <Cartao estilo={{ gap: espaco.md }}>
          <Campo rotulo="Nome" value={nome} onChangeText={setNome} />
          <Campo
            rotulo="OAB"
            value={oab}
            onChangeText={(t) => {
              setOab(t);
              setErro(undefined);
            }}
            placeholder="Ex.: 12.345/ES"
            autoCapitalize="characters"
            erro={erro}
          />
          <Campo rotulo="E-mail (opcional)" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <Botao titulo="Adicionar à equipe" icone="person-add-outline" desabilitado={!nome.trim() || !oab.trim()} aoPressionar={adicionar} />
        </Cartao>
      </Secao>
    </Tela>
  );
}
