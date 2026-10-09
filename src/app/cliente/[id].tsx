import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { CartaoCompromisso, CartaoProcesso } from '../../components/cartoes';
import { SecaoDocumentos } from '../../components/Documentos';
import { Avatar, BotaoIcone, Cartao, LinhaInfo, Secao, Tela, Vazio, estilos } from '../../components/ui';
import { compromissosPendentes, resumirLancamentos } from '../../data/selectors';
import { useDados } from '../../data/store';
import { formatarData } from '../../lib/datas';
import { formatarMoeda } from '../../lib/formatos';
import { cores, espaco } from '../../tema';

export default function DetalheCliente() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const dados = useDados();
  const cliente = dados.clientes.find((c) => c.id === id);

  if (!cliente) {
    return (
      <Tela>
        <Vazio icone="alert-circle-outline" titulo="Cliente não encontrado" texto="Ele pode ter sido excluído." />
      </Tela>
    );
  }

  const processos = dados.processos.filter((p) => p.clienteId === cliente.id);
  const atendimentos = dados.atendimentos
    .filter((a) => a.clienteId === cliente.id)
    .sort((a, b) => b.data.localeCompare(a.data));
  const agenda = compromissosPendentes(dados.compromissos.filter((c) => c.clienteId === cliente.id));
  const resumo = resumirLancamentos(dados.lancamentos.filter((l) => l.clienteId === cliente.id));
  const nomeProcesso = new Map(processos.map((p) => [p.id, p.titulo]));

  return (
    <Tela>
      <Stack.Screen
        options={{
          title: cliente.tipo === 'PJ' ? 'Cliente PJ' : 'Cliente',
          headerRight: () => (
            <BotaoIcone
              icone="create-outline"
              cor="#fff"
              rotulo="Editar cliente"
              aoPressionar={() => router.push(`/cliente/form?id=${cliente.id}`)}
            />
          ),
        }}
      />

      <Cartao estilo={{ gap: espaco.md }}>
        <View style={[estilos.linha, { gap: espaco.md }]}>
          <Avatar nome={cliente.nome} tamanho={52} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 19, fontWeight: '700', color: cores.texto }}>{cliente.nome}</Text>
            <Text style={estilos.textoSuave}>{cliente.tipo === 'PJ' ? 'Pessoa jurídica' : 'Pessoa física'}</Text>
          </View>
        </View>
        <LinhaInfo rotulo={cliente.tipo === 'PJ' ? 'CNPJ' : 'CPF'} valor={cliente.documento} />
        <LinhaInfo rotulo="Telefone" valor={cliente.telefone} />
        <LinhaInfo rotulo="E-mail" valor={cliente.email} />
        <LinhaInfo rotulo="Endereço" valor={cliente.endereco} />
        <LinhaInfo rotulo="Observações" valor={cliente.observacoes} />
      </Cartao>

      {(resumo.recebido > 0 || resumo.aReceber > 0) && (
        <Cartao estilo={{ flexDirection: 'row' }}>
          <View style={{ flex: 1 }}>
            <Text style={estilos.textoSuave}>Honorários recebidos</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: cores.sucesso }}>{formatarMoeda(resumo.recebido)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={estilos.textoSuave}>A receber</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: cores.texto }}>{formatarMoeda(resumo.aReceber)}</Text>
          </View>
        </Cartao>
      )}

      <Secao
        titulo={`Processos (${processos.length})`}
        acao={{ rotulo: 'Novo', aoPressionar: () => router.push(`/processo/form?clienteId=${cliente.id}`) }}
      >
        {processos.length === 0 ? (
          <Text style={estilos.textoSuave}>Nenhum processo deste cliente.</Text>
        ) : (
          processos.map((p) => <CartaoProcesso key={p.id} processo={p} />)
        )}
      </Secao>

      <SecaoDocumentos clienteId={cliente.id} />

      {agenda.length > 0 && (
        <Secao titulo="Próximos compromissos">
          {agenda.map((c) => (
            <CartaoCompromisso key={c.id} compromisso={c} />
          ))}
        </Secao>
      )}

      <Secao
        titulo={`Atendimentos (${atendimentos.length})`}
        acao={{ rotulo: 'Registrar', aoPressionar: () => router.push(`/atendimento/form?clienteId=${cliente.id}`) }}
      >
        {atendimentos.length === 0 ? (
          <Text style={estilos.textoSuave}>Nenhum atendimento registrado.</Text>
        ) : (
          atendimentos.map((a) => (
            <Cartao key={a.id} aoPressionar={() => router.push(`/atendimento/form?id=${a.id}`)}>
              <Text style={estilos.textoSuave}>
                {formatarData(a.data)}
                {a.processoId && nomeProcesso.has(a.processoId) ? ` · ${nomeProcesso.get(a.processoId)}` : ''}
              </Text>
              <Text style={estilos.titulo}>{a.assunto}</Text>
              {!!a.descricao && <Text style={estilos.textoSuave}>{a.descricao}</Text>}
            </Cartao>
          ))
        )}
      </Secao>
    </Tela>
  );
}
