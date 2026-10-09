import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Formulario } from '../../components/Formulario';
import { Campo } from '../../components/ui';
import { useDados } from '../../data/store';
import { extrairIdGoogle, linkDocumentoGoogle } from '../../lib/google';

export default function FormModelo() {
  const params = useLocalSearchParams<{ id?: string }>();
  const existente = useDados((s) => s.modelos.find((m) => m.id === params.id));
  const salvarModelo = useDados((s) => s.salvarModelo);
  const excluirModelo = useDados((s) => s.excluirModelo);

  const [nome, setNome] = useState(existente?.nome ?? '');
  const [link, setLink] = useState(existente ? linkDocumentoGoogle(existente.googleDocId) : '');
  const [descricao, setDescricao] = useState(existente?.descricao ?? '');
  const [erros, setErros] = useState<Record<string, string>>({});

  const docId = extrairIdGoogle(link);

  function salvar() {
    const novosErros: Record<string, string> = {};
    if (!nome.trim()) novosErros.nome = 'Informe um nome.';
    if (!docId) novosErros.link = 'Cole o link do documento no Google Docs.';
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) return;

    salvarModelo({ id: existente?.id, nome: nome.trim(), googleDocId: docId, descricao: descricao.trim() });
    router.back();
  }

  return (
    <Formulario
      titulo={existente ? 'Editar modelo' : 'Novo modelo'}
      aoSalvar={salvar}
      exclusao={
        existente && {
          pergunta: 'O modelo sai da lista do app. O documento continua no seu Google Drive.',
          aoExcluir: () => {
            excluirModelo(existente.id);
            router.back();
          },
        }
      }
    >
      <Campo rotulo="Nome *" value={nome} onChangeText={setNome} placeholder="Ex.: Procuração ad judicia" erro={erros.nome} />
      <Campo
        rotulo="Link do Google Docs *"
        value={link}
        onChangeText={setLink}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="https://docs.google.com/document/d/…"
        erro={erros.link}
        dica={docId ? `ID do documento: ${docId}` : 'No Google Docs, use Compartilhar › Copiar link.'}
      />
      <Campo rotulo="Descrição" value={descricao} onChangeText={setDescricao} multiline />
    </Formulario>
  );
}
