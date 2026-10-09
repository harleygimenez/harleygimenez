import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Formulario } from '../../components/Formulario';
import { Campo, Seletor } from '../../components/ui';
import { useDados } from '../../data/store';
import type { TipoPessoa } from '../../data/types';
import { avisar } from '../../lib/confirmar';
import { mascararDocumento, mascararTelefone } from '../../lib/formatos';

export default function FormCliente() {
  const params = useLocalSearchParams<{ id?: string }>();
  const existente = useDados((s) => s.clientes.find((c) => c.id === params.id));
  const processosDoCliente = useDados((s) => s.processos.filter((p) => p.clienteId === params.id).length);
  const salvarCliente = useDados((s) => s.salvarCliente);
  const excluirCliente = useDados((s) => s.excluirCliente);

  const [tipo, setTipo] = useState<TipoPessoa>(existente?.tipo ?? 'PF');
  const [nome, setNome] = useState(existente?.nome ?? '');
  const [documento, setDocumento] = useState(existente?.documento ?? '');
  const [telefone, setTelefone] = useState(existente?.telefone ?? '');
  const [email, setEmail] = useState(existente?.email ?? '');
  const [endereco, setEndereco] = useState(existente?.endereco ?? '');
  const [observacoes, setObservacoes] = useState(existente?.observacoes ?? '');
  const [erros, setErros] = useState<Record<string, string>>({});

  function salvar() {
    const novosErros: Record<string, string> = {};
    if (!nome.trim()) novosErros.nome = 'Informe o nome.';
    const digitos = documento.replace(/\D/g, '').length;
    const esperado = tipo === 'PF' ? 11 : 14;
    if (digitos > 0 && digitos !== esperado) novosErros.documento = `${tipo === 'PF' ? 'CPF' : 'CNPJ'} deve ter ${esperado} dígitos.`;
    if (email && !/^\S+@\S+\.\S+$/.test(email)) novosErros.email = 'E-mail inválido.';
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) return;

    const id = salvarCliente({
      id: existente?.id,
      tipo,
      nome: nome.trim(),
      documento,
      telefone,
      email: email.trim(),
      endereco: endereco.trim(),
      observacoes: observacoes.trim(),
      criadoEm: existente?.criadoEm ?? new Date().toISOString(),
    });
    if (existente) router.back();
    else router.replace(`/cliente/${id}`);
  }

  return (
    <Formulario
      titulo={existente ? 'Editar cliente' : 'Novo cliente'}
      aoSalvar={salvar}
      exclusao={
        existente && {
          pergunta: 'O cliente e seus atendimentos serão apagados.',
          aoExcluir: () => {
            if (processosDoCliente > 0) {
              avisar('Não é possível excluir', 'Este cliente tem processos. Exclua ou transfira os processos antes.');
              return;
            }
            excluirCliente(existente.id);
            router.dismissTo('/clientes');
          },
        }
      }
    >
      <Seletor<TipoPessoa>
        rotulo="Tipo"
        opcoes={[
          { valor: 'PF', rotulo: 'Pessoa física' },
          { valor: 'PJ', rotulo: 'Pessoa jurídica' },
        ]}
        valor={tipo}
        aoMudar={setTipo}
      />
      <Campo rotulo={tipo === 'PJ' ? 'Razão social *' : 'Nome completo *'} value={nome} onChangeText={setNome} erro={erros.nome} />
      <Campo
        rotulo={tipo === 'PJ' ? 'CNPJ' : 'CPF'}
        value={documento}
        onChangeText={(t) => setDocumento(mascararDocumento(t))}
        keyboardType="number-pad"
        erro={erros.documento}
      />
      <Campo rotulo="Telefone" value={telefone} onChangeText={(t) => setTelefone(mascararTelefone(t))} keyboardType="phone-pad" />
      <Campo
        rotulo="E-mail"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        erro={erros.email}
      />
      <Campo rotulo="Endereço" value={endereco} onChangeText={setEndereco} />
      <Campo rotulo="Observações" value={observacoes} onChangeText={setObservacoes} multiline />
    </Formulario>
  );
}
