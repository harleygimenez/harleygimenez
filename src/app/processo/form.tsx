import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';

import { Formulario } from '../../components/Formulario';
import { Botao, Campo, Seletor, SeletorRegistro, estilos } from '../../components/ui';
import { useDados } from '../../data/store';
import { AREAS, ETAPAS, type Area, type EtapaId, type StatusProcesso } from '../../data/types';
import { decomporCnj, mascararCnj, segmentoJustica, somenteDigitos, validarCnj } from '../../lib/cnj';
import { aliasTribunal, consultarDataJud, type ProcessoDataJud } from '../../lib/datajud';
import { centavosParaTexto, lerMoeda, mascararMoeda } from '../../lib/formatos';
import { cores } from '../../tema';

export default function FormProcesso() {
  const params = useLocalSearchParams<{ id?: string; clienteId?: string }>();
  const existente = useDados((s) => s.processos.find((p) => p.id === params.id));
  const clientes = useDados((s) => s.clientes);
  const salvarProcesso = useDados((s) => s.salvarProcesso);
  const importarDataJud = useDados((s) => s.importarDataJud);
  const chaveDataJud = useDados((s) => s.integracao.chaveDataJud);
  const excluirProcesso = useDados((s) => s.excluirProcesso);

  const [titulo, setTitulo] = useState(existente?.titulo ?? '');
  const [clienteId, setClienteId] = useState(existente?.clienteId ?? params.clienteId);
  const [numero, setNumero] = useState(existente?.numero ?? '');
  const [area, setArea] = useState<Area>(existente?.area ?? 'Cível');
  const [etapa, setEtapa] = useState<EtapaId>(existente?.etapa ?? 'consulta');
  const [status, setStatus] = useState<StatusProcesso>(existente?.status ?? 'ativo');
  const [parteContraria, setParteContraria] = useState(existente?.parteContraria ?? '');
  const [tribunal, setTribunal] = useState(existente?.tribunal ?? '');
  const [orgao, setOrgao] = useState(existente?.orgao ?? '');
  const [valorCausa, setValorCausa] = useState(centavosParaTexto(existente?.valorCausa ?? 0));
  const [observacoes, setObservacoes] = useState(existente?.observacoes ?? '');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [datajud, setDatajud] = useState<ProcessoDataJud | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [avisoDataJud, setAvisoDataJud] = useState<{ erro: boolean; texto: string } | null>(null);

  const digitos = somenteDigitos(numero).length;
  const segmento = segmentoJustica(numero);
  const podeConsultar = digitos === 20 && validarCnj(numero) && !!aliasTribunal(numero);

  async function preencherPeloDataJud() {
    setConsultando(true);
    setAvisoDataJud(null);
    try {
      const dados = await consultarDataJud(numero, { chave: chaveDataJud || undefined });
      if (!dados) {
        setAvisoDataJud({ erro: true, texto: 'O DataJud não encontrou este processo.' });
        return;
      }
      setDatajud(dados);
      // Só preenche o que está vazio, para não apagar o que o usuário digitou.
      if (!titulo.trim()) setTitulo([dados.classe, dados.assuntos[0]].filter(Boolean).join(' - '));
      if (!tribunal.trim()) setTribunal(dados.tribunal);
      if (!orgao.trim()) setOrgao(dados.orgaoJulgador);
      if (decomporCnj(numero)?.segmento === '5') setArea('Trabalhista');
      setAvisoDataJud({
        erro: false,
        texto: `Encontrado: ${dados.classe || 'processo'} · ${dados.movimentos.length} andamentos serão importados ao salvar.`,
      });
    } catch (e) {
      setAvisoDataJud({ erro: true, texto: (e as Error).message });
    } finally {
      setConsultando(false);
    }
  }

  function salvar() {
    const novosErros: Record<string, string> = {};
    if (!titulo.trim()) novosErros.titulo = 'Informe um título.';
    if (!clienteId) novosErros.cliente = 'Escolha o cliente.';
    if (digitos > 0 && digitos < 20) novosErros.numero = 'O número CNJ tem 20 dígitos.';
    else if (digitos === 20 && !validarCnj(numero)) novosErros.numero = 'Dígito verificador não confere. Revise o número.';
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0 || !clienteId) return;

    const id = salvarProcesso({
      id: existente?.id,
      titulo: titulo.trim(),
      clienteId,
      numero,
      area,
      etapa,
      status,
      parteContraria: parteContraria.trim(),
      tribunal: tribunal.trim(),
      orgao: orgao.trim(),
      valorCausa: lerMoeda(valorCausa),
      observacoes: observacoes.trim(),
      criadoEm: existente?.criadoEm ?? new Date().toISOString(),
    });
    if (datajud && somenteDigitos(datajud.numero) === somenteDigitos(numero)) importarDataJud(id, datajud);
    if (existente) router.back();
    else router.replace(`/processo/${id}`);
  }

  return (
    <Formulario
      titulo={existente ? 'Editar processo' : 'Novo processo'}
      aoSalvar={salvar}
      exclusao={
        existente && {
          pergunta: 'O processo e seus andamentos serão apagados. Prazos e lançamentos ficam sem vínculo.',
          aoExcluir: () => {
            excluirProcesso(existente.id);
            router.dismissTo('/processos');
          },
        }
      }
    >
      <Campo rotulo="Título *" value={titulo} onChangeText={setTitulo} placeholder="Ex.: Ação de cobrança" erro={erros.titulo} />
      <SeletorRegistro
        rotulo="Cliente *"
        itens={clientes.map((c) => ({ id: c.id, titulo: c.nome, subtitulo: c.documento }))}
        valor={clienteId}
        aoMudar={setClienteId}
        permitirVazio={false}
        erro={erros.cliente}
      />
      {clientes.length === 0 && (
        <Botao titulo="Cadastrar cliente" icone="person-add-outline" variante="secundario" aoPressionar={() => router.push('/cliente/form')} />
      )}
      <Campo
        rotulo="Número (CNJ)"
        value={numero}
        onChangeText={(t) => {
          setNumero(mascararCnj(t));
          setErros(({ numero: _, ...resto }) => resto);
          setAvisoDataJud(null);
        }}
        placeholder="0000000-00.0000.0.00.0000"
        keyboardType="number-pad"
        erro={erros.numero}
        dica={digitos === 20 && validarCnj(numero) ? `Número válido${segmento ? ` · ${segmento}` : ''}` : 'Deixe em branco se ainda não foi distribuído.'}
      />
      {podeConsultar &&
        (consultando ? (
          <ActivityIndicator color={cores.primaria} />
        ) : (
          <Botao titulo="Preencher pelo DataJud (CNJ)" icone="cloud-download-outline" variante="secundario" aoPressionar={preencherPeloDataJud} />
        ))}
      {avisoDataJud && (
        <Text style={[estilos.textoSuave, { color: avisoDataJud.erro ? cores.perigo : cores.sucesso, marginTop: -8 }]}>
          {avisoDataJud.texto}
        </Text>
      )}
      <Campo rotulo="Parte contrária" value={parteContraria} onChangeText={setParteContraria} />
      <Seletor<Area> rotulo="Área" opcoes={AREAS.map((a) => ({ valor: a, rotulo: a }))} valor={area} aoMudar={setArea} />
      <Seletor<EtapaId>
        rotulo="Fase"
        opcoes={ETAPAS.map((e) => ({ valor: e.id, rotulo: e.nome, cor: e.cor }))}
        valor={etapa}
        aoMudar={setEtapa}
      />
      <Campo rotulo="Tribunal" value={tribunal} onChangeText={setTribunal} placeholder="Ex.: TJSP" />
      <Campo rotulo="Órgão / vara" value={orgao} onChangeText={setOrgao} placeholder="Ex.: 2ª Vara Cível" />
      <Campo
        rotulo="Valor da causa"
        value={valorCausa}
        onChangeText={(t) => setValorCausa(mascararMoeda(t))}
        keyboardType="number-pad"
        placeholder="R$ 0,00"
      />
      <Seletor<StatusProcesso>
        rotulo="Situação"
        opcoes={[
          { valor: 'ativo', rotulo: 'Ativo' },
          { valor: 'arquivado', rotulo: 'Arquivado' },
        ]}
        valor={status}
        aoMudar={setStatus}
      />
      <Campo rotulo="Observações" value={observacoes} onChangeText={setObservacoes} multiline />
    </Formulario>
  );
}
