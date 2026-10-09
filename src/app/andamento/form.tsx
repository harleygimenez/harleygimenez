import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Formulario } from '../../components/Formulario';
import { Campo, CampoData, Seletor, SeletorRegistro } from '../../components/ui';
import { useDados } from '../../data/store';
import { TIPOS_ANDAMENTO, type DataISO, type TipoAndamento } from '../../data/types';
import { hojeISO } from '../../lib/datas';

export default function FormAndamento() {
  const params = useLocalSearchParams<{ id?: string; processoId?: string }>();
  const existente = useDados((s) => s.andamentos.find((a) => a.id === params.id));
  const processos = useDados((s) => s.processos);
  const salvarAndamento = useDados((s) => s.salvarAndamento);
  const excluirAndamento = useDados((s) => s.excluirAndamento);

  const [processoId, setProcessoId] = useState(existente?.processoId ?? params.processoId);
  const [tipo, setTipo] = useState<TipoAndamento>(existente?.tipo ?? 'andamento');
  const [data, setData] = useState<DataISO>(existente?.data ?? hojeISO());
  const [descricao, setDescricao] = useState(existente?.descricao ?? '');
  const [erros, setErros] = useState<Record<string, string>>({});

  function salvar() {
    const novosErros: Record<string, string> = {};
    if (!processoId) novosErros.processo = 'Escolha o processo.';
    if (!data) novosErros.data = 'Data inválida.';
    if (!descricao.trim()) novosErros.descricao = 'Descreva o andamento.';
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0 || !processoId) return;

    salvarAndamento({ id: existente?.id, processoId, tipo, data, descricao: descricao.trim() });
    router.back();
  }

  // "Mudança de fase" é registrada automaticamente ao mover o processo no pipeline.
  const tipos = Object.entries(TIPOS_ANDAMENTO)
    .filter(([v]) => v !== 'etapa' || existente?.tipo === 'etapa')
    .map(([v, r]) => ({ valor: v as TipoAndamento, rotulo: r }));

  return (
    <Formulario
      titulo={existente ? 'Editar andamento' : 'Novo andamento'}
      aoSalvar={salvar}
      exclusao={
        existente && {
          pergunta: 'Este registro será removido da linha do tempo.',
          aoExcluir: () => {
            excluirAndamento(existente.id);
            router.back();
          },
        }
      }
    >
      <SeletorRegistro
        rotulo="Processo *"
        itens={processos.map((p) => ({ id: p.id, titulo: p.titulo, subtitulo: p.numero || p.area }))}
        valor={processoId}
        aoMudar={setProcessoId}
        permitirVazio={false}
        erro={erros.processo}
      />
      <Seletor<TipoAndamento> rotulo="Tipo" opcoes={tipos} valor={tipo} aoMudar={setTipo} />
      <CampoData rotulo="Data *" valor={data} aoMudar={setData} erro={erros.data} />
      <Campo
        rotulo="Descrição *"
        value={descricao}
        onChangeText={setDescricao}
        multiline
        placeholder="Ex.: Juntada de contestação pela parte ré."
        erro={erros.descricao}
      />
    </Formulario>
  );
}
