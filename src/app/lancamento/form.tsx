import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Formulario } from '../../components/Formulario';
import { Campo, CampoData, Seletor, SeletorRegistro } from '../../components/ui';
import { useDados } from '../../data/store';
import { CATEGORIAS_LANCAMENTO, type CategoriaLancamento, type DataISO, type TipoLancamento } from '../../data/types';
import { hojeISO } from '../../lib/datas';
import { centavosParaTexto, lerMoeda, mascararMoeda } from '../../lib/formatos';
import { cores } from '../../tema';

export default function FormLancamento() {
  const params = useLocalSearchParams<{ id?: string; processoId?: string }>();
  const existente = useDados((s) => s.lancamentos.find((l) => l.id === params.id));
  const processos = useDados((s) => s.processos);
  const clientes = useDados((s) => s.clientes);
  const salvarLancamento = useDados((s) => s.salvarLancamento);
  const excluirLancamento = useDados((s) => s.excluirLancamento);

  const processoInicial = existente?.processoId ?? params.processoId;
  const [tipo, setTipo] = useState<TipoLancamento>(existente?.tipo ?? 'receita');
  const [categoria, setCategoria] = useState<CategoriaLancamento>(existente?.categoria ?? 'honorarios');
  const [descricao, setDescricao] = useState(existente?.descricao ?? '');
  const [valor, setValor] = useState(centavosParaTexto(existente?.valor ?? 0));
  const [vencimento, setVencimento] = useState<DataISO>(existente?.vencimento ?? hojeISO());
  const [pago, setPago] = useState<'sim' | 'nao'>(existente?.pago ? 'sim' : 'nao');
  const [processoId, setProcessoId] = useState(processoInicial);
  const [clienteId, setClienteId] = useState(
    existente?.clienteId ?? processos.find((p) => p.id === processoInicial)?.clienteId,
  );
  const [erros, setErros] = useState<Record<string, string>>({});

  function escolherProcesso(id: string | undefined) {
    setProcessoId(id);
    const doProcesso = processos.find((p) => p.id === id)?.clienteId;
    if (doProcesso) setClienteId(doProcesso);
  }

  function salvar() {
    const novosErros: Record<string, string> = {};
    if (!descricao.trim()) novosErros.descricao = 'Informe uma descrição.';
    if (lerMoeda(valor) <= 0) novosErros.valor = 'Informe um valor.';
    if (!vencimento) novosErros.vencimento = 'Data inválida.';
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) return;

    const quitado = pago === 'sim';
    salvarLancamento({
      id: existente?.id,
      tipo,
      categoria,
      descricao: descricao.trim(),
      valor: lerMoeda(valor),
      vencimento,
      pago: quitado,
      pagoEm: quitado ? (existente?.pagoEm ?? hojeISO()) : undefined,
      processoId,
      clienteId,
    });
    router.back();
  }

  return (
    <Formulario
      titulo={existente ? 'Editar lançamento' : 'Novo lançamento'}
      aoSalvar={salvar}
      exclusao={
        existente && {
          pergunta: `"${existente.descricao}" será apagado.`,
          aoExcluir: () => {
            excluirLancamento(existente.id);
            router.back();
          },
        }
      }
    >
      <Seletor<TipoLancamento>
        rotulo="Tipo"
        opcoes={[
          { valor: 'receita', rotulo: 'Receita', cor: cores.sucesso },
          { valor: 'despesa', rotulo: 'Despesa', cor: cores.perigo },
        ]}
        valor={tipo}
        aoMudar={setTipo}
      />
      <Seletor<CategoriaLancamento>
        rotulo="Categoria"
        opcoes={Object.entries(CATEGORIAS_LANCAMENTO).map(([v, r]) => ({ valor: v as CategoriaLancamento, rotulo: r }))}
        valor={categoria}
        aoMudar={setCategoria}
      />
      <Campo rotulo="Descrição *" value={descricao} onChangeText={setDescricao} erro={erros.descricao} />
      <Campo
        rotulo="Valor *"
        value={valor}
        onChangeText={(t) => setValor(mascararMoeda(t))}
        keyboardType="number-pad"
        placeholder="R$ 0,00"
        erro={erros.valor}
      />
      <CampoData rotulo="Vencimento *" valor={vencimento} aoMudar={setVencimento} erro={erros.vencimento} />
      <Seletor<'sim' | 'nao'>
        rotulo="Situação"
        opcoes={[
          { valor: 'nao', rotulo: 'Pendente' },
          { valor: 'sim', rotulo: tipo === 'receita' ? 'Recebido' : 'Pago', cor: cores.sucesso },
        ]}
        valor={pago}
        aoMudar={setPago}
      />
      <SeletorRegistro
        rotulo="Processo"
        itens={processos.map((p) => ({ id: p.id, titulo: p.titulo, subtitulo: p.numero || p.area }))}
        valor={processoId}
        aoMudar={escolherProcesso}
      />
      <SeletorRegistro
        rotulo="Cliente"
        itens={clientes.map((c) => ({ id: c.id, titulo: c.nome }))}
        valor={clienteId}
        aoMudar={setClienteId}
      />
    </Formulario>
  );
}
