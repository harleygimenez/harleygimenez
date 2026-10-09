import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { CalculadoraPrazo } from '../../components/CalculadoraPrazo';
import { Formulario } from '../../components/Formulario';
import { Botao, Campo, CampoData, Cartao, Seletor, SeletorRegistro, estilos } from '../../components/ui';
import { useDados } from '../../data/store';
import { TIPOS_COMPROMISSO, type DataISO, type Prioridade, type TipoCompromisso } from '../../data/types';
import { ehDiaUtil, hojeISO } from '../../lib/datas';
import { cores } from '../../tema';

export default function FormCompromisso() {
  const params = useLocalSearchParams<{ id?: string; processoId?: string; data?: string; tipo?: string }>();
  const existente = useDados((s) => s.compromissos.find((c) => c.id === params.id));
  const processos = useDados((s) => s.processos);
  const clientes = useDados((s) => s.clientes);
  const salvarCompromisso = useDados((s) => s.salvarCompromisso);
  const excluirCompromisso = useDados((s) => s.excluirCompromisso);

  const processoInicial = existente?.processoId ?? params.processoId;
  const tipoInicial = params.tipo && params.tipo in TIPOS_COMPROMISSO ? (params.tipo as TipoCompromisso) : 'prazo';

  const [tipo, setTipo] = useState<TipoCompromisso>(existente?.tipo ?? tipoInicial);
  const [titulo, setTitulo] = useState(existente?.titulo ?? '');
  const [data, setData] = useState<DataISO>(existente?.data ?? params.data ?? hojeISO());
  const [hora, setHora] = useState(existente?.hora ?? '');
  const [processoId, setProcessoId] = useState(processoInicial);
  const [clienteId, setClienteId] = useState(
    existente?.clienteId ?? processos.find((p) => p.id === processoInicial)?.clienteId,
  );
  const [prioridade, setPrioridade] = useState<Prioridade>(existente?.prioridade ?? 'media');
  const [descricao, setDescricao] = useState(existente?.descricao ?? '');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [calculando, setCalculando] = useState(false);

  function escolherProcesso(id: string | undefined) {
    setProcessoId(id);
    const doProcesso = processos.find((p) => p.id === id)?.clienteId;
    if (doProcesso) setClienteId(doProcesso);
  }

  function salvar() {
    const novosErros: Record<string, string> = {};
    if (!titulo.trim()) novosErros.titulo = 'Informe um título.';
    if (!data) novosErros.data = 'Data inválida.';
    if (hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) novosErros.hora = 'Use o formato HH:mm.';
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) return;

    salvarCompromisso({
      id: existente?.id,
      tipo,
      titulo: titulo.trim(),
      data,
      hora,
      processoId,
      clienteId,
      prioridade,
      descricao: descricao.trim(),
      concluido: existente?.concluido ?? false,
      concluidoEm: existente?.concluidoEm,
    });
    router.back();
  }

  return (
    <Formulario
      titulo={existente ? `Editar ${TIPOS_COMPROMISSO[existente.tipo].nome.toLowerCase()}` : 'Novo compromisso'}
      aoSalvar={salvar}
      exclusao={
        existente && {
          pergunta: `"${existente.titulo}" será apagado da agenda.`,
          aoExcluir: () => {
            excluirCompromisso(existente.id);
            router.back();
          },
        }
      }
    >
      <Seletor<TipoCompromisso>
        rotulo="Tipo"
        opcoes={Object.entries(TIPOS_COMPROMISSO).map(([valor, t]) => ({ valor: valor as TipoCompromisso, rotulo: t.nome, cor: t.cor }))}
        valor={tipo}
        aoMudar={setTipo}
      />
      <Campo rotulo="Título *" value={titulo} onChangeText={setTitulo} placeholder="Ex.: Contestação" erro={erros.titulo} />
      <CampoData rotulo="Data *" valor={data} aoMudar={setData} erro={erros.data} />
      {tipo === 'prazo' && data && !ehDiaUtil(data) && (
        <Text style={[estilos.textoSuave, { color: cores.alerta, marginTop: -8 }]}>
          Atenção: esta data não é dia útil. Prazos vencidos em dia não útil são prorrogados.
        </Text>
      )}
      {tipo === 'prazo' &&
        (calculando ? (
          <Cartao>
            <CalculadoraPrazo
              rotuloAplicar="Usar como data do prazo"
              aoAplicar={(vencimento) => {
                setData(vencimento);
                setCalculando(false);
              }}
            />
          </Cartao>
        ) : (
          <Botao
            titulo="Calcular vencimento em dias úteis"
            icone="calculator-outline"
            variante="secundario"
            aoPressionar={() => setCalculando(true)}
          />
        ))}
      <Campo
        rotulo="Horário"
        value={hora}
        onChangeText={(t) => {
          const d = t.replace(/\D/g, '').slice(0, 4);
          setHora(d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d);
        }}
        placeholder="HH:mm (opcional)"
        keyboardType="number-pad"
        erro={erros.hora}
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
      <Seletor<Prioridade>
        rotulo="Prioridade"
        opcoes={[
          { valor: 'baixa', rotulo: 'Baixa', cor: cores.textoSuave },
          { valor: 'media', rotulo: 'Média', cor: cores.primaria },
          { valor: 'alta', rotulo: 'Alta', cor: cores.perigo },
        ]}
        valor={prioridade}
        aoMudar={setPrioridade}
      />
      <Campo rotulo="Descrição" value={descricao} onChangeText={setDescricao} multiline />
    </Formulario>
  );
}
