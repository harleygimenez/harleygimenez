import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Formulario } from '../../components/Formulario';
import { Campo, CampoData, SeletorRegistro } from '../../components/ui';
import { useDados } from '../../data/store';
import type { DataISO } from '../../data/types';
import { hojeISO } from '../../lib/datas';

export default function FormAtendimento() {
  const params = useLocalSearchParams<{ id?: string; clienteId?: string; processoId?: string }>();
  const existente = useDados((s) => s.atendimentos.find((a) => a.id === params.id));
  const clientes = useDados((s) => s.clientes);
  const processos = useDados((s) => s.processos);
  const salvarAtendimento = useDados((s) => s.salvarAtendimento);
  const excluirAtendimento = useDados((s) => s.excluirAtendimento);

  const [clienteId, setClienteId] = useState(existente?.clienteId ?? params.clienteId);
  const [processoId, setProcessoId] = useState(existente?.processoId ?? params.processoId);
  const [data, setData] = useState<DataISO>(existente?.data ?? hojeISO());
  const [assunto, setAssunto] = useState(existente?.assunto ?? '');
  const [descricao, setDescricao] = useState(existente?.descricao ?? '');
  const [erros, setErros] = useState<Record<string, string>>({});

  const processosDoCliente = processos.filter((p) => p.clienteId === clienteId);

  function salvar() {
    const novosErros: Record<string, string> = {};
    if (!clienteId) novosErros.cliente = 'Escolha o cliente.';
    if (!assunto.trim()) novosErros.assunto = 'Informe o assunto.';
    if (!data) novosErros.data = 'Data inválida.';
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0 || !clienteId) return;

    salvarAtendimento({
      id: existente?.id,
      clienteId,
      processoId: processosDoCliente.some((p) => p.id === processoId) ? processoId : undefined,
      data,
      assunto: assunto.trim(),
      descricao: descricao.trim(),
    });
    router.back();
  }

  return (
    <Formulario
      titulo={existente ? 'Editar atendimento' : 'Novo atendimento'}
      aoSalvar={salvar}
      exclusao={
        existente && {
          pergunta: `"${existente.assunto}" será apagado.`,
          aoExcluir: () => {
            excluirAtendimento(existente.id);
            router.back();
          },
        }
      }
    >
      <SeletorRegistro
        rotulo="Cliente *"
        itens={clientes.map((c) => ({ id: c.id, titulo: c.nome }))}
        valor={clienteId}
        aoMudar={setClienteId}
        permitirVazio={false}
        erro={erros.cliente}
      />
      <SeletorRegistro
        rotulo="Processo relacionado"
        itens={processosDoCliente.map((p) => ({ id: p.id, titulo: p.titulo, subtitulo: p.numero || p.area }))}
        valor={processoId}
        aoMudar={setProcessoId}
      />
      <CampoData rotulo="Data *" valor={data} aoMudar={setData} erro={erros.data} />
      <Campo rotulo="Assunto *" value={assunto} onChangeText={setAssunto} erro={erros.assunto} />
      <Campo rotulo="Anotações" value={descricao} onChangeText={setDescricao} multiline />
    </Formulario>
  );
}
