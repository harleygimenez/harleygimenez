import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Formulario } from '../../components/Formulario';
import { Botao, Campo, Seletor, SeletorRegistro } from '../../components/ui';
import { useDados } from '../../data/store';
import { AREAS, ETAPAS, type Area, type EtapaId, type StatusProcesso } from '../../data/types';
import { mascararCnj, segmentoJustica, somenteDigitos, validarCnj } from '../../lib/cnj';
import { centavosParaTexto, lerMoeda, mascararMoeda } from '../../lib/formatos';

export default function FormProcesso() {
  const params = useLocalSearchParams<{ id?: string; clienteId?: string }>();
  const existente = useDados((s) => s.processos.find((p) => p.id === params.id));
  const clientes = useDados((s) => s.clientes);
  const salvarProcesso = useDados((s) => s.salvarProcesso);
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

  const digitos = somenteDigitos(numero).length;
  const segmento = segmentoJustica(numero);

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
        }}
        placeholder="0000000-00.0000.0.00.0000"
        keyboardType="number-pad"
        erro={erros.numero}
        dica={digitos === 20 && validarCnj(numero) ? `Número válido${segmento ? ` · ${segmento}` : ''}` : 'Deixe em branco se ainda não foi distribuído.'}
      />
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
