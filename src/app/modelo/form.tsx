import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Formulario } from '../../components/Formulario';
import { Campo, Seletor } from '../../components/ui';
import { useDados } from '../../data/store';
import { PROVEDORES, type Provedor } from '../../data/types';
import { entradaDoModelo, identificarArquivo, validarModelo } from '../../lib/armazenamento';

export default function FormModelo() {
  const params = useLocalSearchParams<{ id?: string }>();
  const existente = useDados((s) => s.modelos.find((m) => m.id === params.id));
  const integracao = useDados((s) => s.integracao);
  const salvarModelo = useDados((s) => s.salvarModelo);
  const excluirModelo = useDados((s) => s.excluirModelo);

  // Sugere o provedor já configurado quando só um deles está.
  const padrao: Provedor = !integracao.google.webhookUrl && integracao.onedrive.webhookUrl ? 'onedrive' : 'google';
  const [provedor, setProvedor] = useState<Provedor>(existente?.provedor ?? padrao);
  const [nome, setNome] = useState(existente?.nome ?? '');
  const [entrada, setEntrada] = useState(existente ? entradaDoModelo(existente) : '');
  const [descricao, setDescricao] = useState(existente?.descricao ?? '');
  const [erros, setErros] = useState<Record<string, string>>({});

  const arquivoId = identificarArquivo(provedor, entrada);
  const google = provedor === 'google';

  function salvar() {
    const novosErros: Record<string, string> = {};
    if (!nome.trim()) novosErros.nome = 'Informe um nome.';
    const invalido = validarModelo(provedor, entrada);
    if (invalido) novosErros.arquivo = invalido;
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) return;

    salvarModelo({ id: existente?.id, nome: nome.trim(), provedor, arquivoId, descricao: descricao.trim() });
    router.back();
  }

  return (
    <Formulario
      titulo={existente ? 'Editar modelo' : 'Novo modelo'}
      aoSalvar={salvar}
      exclusao={
        existente && {
          pergunta: `O modelo sai da lista do app. O arquivo continua no seu ${PROVEDORES[existente.provedor].nome}.`,
          aoExcluir: () => {
            excluirModelo(existente.id);
            router.back();
          },
        }
      }
    >
      <Seletor<Provedor>
        rotulo="Onde está o modelo"
        opcoes={(Object.keys(PROVEDORES) as Provedor[]).map((p) => ({ valor: p, rotulo: PROVEDORES[p].modelo }))}
        valor={provedor}
        aoMudar={(p) => {
          setProvedor(p);
          setEntrada('');
          setErros({});
        }}
      />
      <Campo rotulo="Nome *" value={nome} onChangeText={setNome} placeholder="Ex.: Procuração ad judicia" erro={erros.nome} />
      <Campo
        rotulo={google ? 'Link do Google Docs *' : 'Caminho do .docx no OneDrive *'}
        value={entrada}
        onChangeText={setEntrada}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={google ? 'https://docs.google.com/document/d/…' : '/OpenJus/Modelos/Procuracao.docx'}
        erro={erros.arquivo}
        dica={
          google
            ? arquivoId
              ? `ID do documento: ${arquivoId}`
              : 'No Google Docs, use Compartilhar › Copiar link.'
            : 'Caminho a partir da raiz do seu OneDrive. Escreva os campos no Word como {{cliente.nome}}.'
        }
      />
      <Campo rotulo="Descrição" value={descricao} onChangeText={setDescricao} multiline />
    </Formulario>
  );
}
