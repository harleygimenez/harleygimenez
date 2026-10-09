import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useDados } from '../data/store';
import type { Processo } from '../data/types';
import { validarCnj } from '../lib/cnj';
import { aliasTribunal, consultarDataJud, descreverGrau } from '../lib/datajud';
import { diaDoInstante, formatarData } from '../lib/datas';
import { cores, espaco, raio } from '../tema';
import { Botao, Cartao, LinhaInfo, Secao, estilos } from './ui';

type Resultado = { tipo: 'ok' | 'erro'; mensagem: string } | null;

/** Consulta o processo no DataJud (CNJ) e importa os movimentos como andamentos. */
export function CartaoDataJud({ processo }: { processo: Processo }) {
  const chave = useDados((s) => s.integracao.chaveDataJud);
  const importarDataJud = useDados((s) => s.importarDataJud);
  const [consultando, setConsultando] = useState(false);
  const [resultado, setResultado] = useState<Resultado>(null);

  if (!processo.numero || !validarCnj(processo.numero) || !aliasTribunal(processo.numero)) return null;
  const resumo = processo.datajud;

  async function atualizar() {
    setConsultando(true);
    setResultado(null);
    try {
      const dados = await consultarDataJud(processo.numero, { chave: chave || undefined });
      if (!dados) {
        setResultado({
          tipo: 'erro',
          mensagem: 'O DataJud não encontrou este processo. Ele pode ser recente, sigiloso ou ainda não ter sido enviado pelo tribunal.',
        });
        return;
      }
      const novos = importarDataJud(processo.id, dados);
      setResultado({
        tipo: 'ok',
        mensagem:
          novos === 0
            ? `Nenhum andamento novo (${dados.movimentos.length} no DataJud).`
            : `${novos} ${novos === 1 ? 'andamento novo importado' : 'andamentos novos importados'} para a timeline.`,
      });
    } catch (e) {
      setResultado({ tipo: 'erro', mensagem: (e as Error).message });
    } finally {
      setConsultando(false);
    }
  }

  return (
    <Secao titulo="DataJud (CNJ)">
      <Cartao estilo={{ gap: espaco.md }}>
        {resumo ? (
          <>
            <LinhaInfo rotulo="Classe" valor={resumo.classe} />
            <LinhaInfo rotulo="Órgão julgador" valor={resumo.orgaoJulgador} />
            <LinhaInfo rotulo="Assuntos" valor={resumo.assuntos.join(' · ')} />
            <LinhaInfo rotulo="Instâncias" valor={resumo.graus.map(descreverGrau).join(', ')} />
            <Text style={estilos.textoSuave}>Atualizado em {formatarData(diaDoInstante(resumo.atualizadoEm))}.</Text>
          </>
        ) : (
          <Text style={estilos.textoSuave}>
            Busque a classe, o órgão julgador e as movimentações deste processo na base pública do CNJ.
          </Text>
        )}

        {consultando ? (
          <View style={s.carregando}>
            <ActivityIndicator color={cores.primaria} />
            <Text style={estilos.textoSuave}>Consultando o DataJud…</Text>
          </View>
        ) : (
          <Botao
            titulo={resumo ? 'Atualizar andamentos' : 'Buscar andamentos no DataJud'}
            icone="sync-outline"
            variante="secundario"
            aoPressionar={atualizar}
          />
        )}

        {resultado && (
          <View style={[s.resultado, { backgroundColor: resultado.tipo === 'ok' ? cores.sucessoClaro : cores.perigoClaro }]}>
            <Ionicons
              name={resultado.tipo === 'ok' ? 'checkmark-circle' : 'alert-circle'}
              size={20}
              color={resultado.tipo === 'ok' ? cores.sucesso : cores.perigo}
            />
            <Text style={{ flex: 1, color: resultado.tipo === 'ok' ? cores.sucesso : cores.perigo }}>{resultado.mensagem}</Text>
          </View>
        )}
      </Cartao>
    </Secao>
  );
}

const s = StyleSheet.create({
  carregando: { flexDirection: 'row', gap: espaco.sm, alignItems: 'center', justifyContent: 'center' },
  resultado: { flexDirection: 'row', gap: espaco.sm, alignItems: 'center', padding: espaco.md, borderRadius: raio.md },
});
