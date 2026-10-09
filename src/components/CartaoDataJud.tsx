import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useDados } from '../data/store';
import type { Processo } from '../data/types';
import { validarCnj } from '../lib/cnj';
import { aliasTribunal, consultarDataJud, descreverGrau } from '../lib/datajud';
import { diaDoInstante, formatarData } from '../lib/datas';
import { consultarPublicacoes } from '../lib/djen';
import { cores, espaco } from '../tema';
import { Aviso, Botao, Cartao, LinhaInfo, Secao, estilos } from './ui';

type Resultado = { tipo: 'ok' | 'erro'; mensagem: string };

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Atualiza o processo nas bases públicas do CNJ: movimentações e classe pelo DataJud e
 * o texto das publicações (despachos, decisões, sentenças) pelo Diário de Justiça (DJEN).
 */
export function CartaoDataJud({ processo }: { processo: Processo }) {
  const chave = useDados((s) => s.integracao.chaveDataJud);
  const importarDataJud = useDados((s) => s.importarDataJud);
  const importarPublicacoes = useDados((s) => s.importarPublicacoes);
  const [consultando, setConsultando] = useState(false);
  const [resultados, setResultados] = useState<Resultado[]>([]);

  if (!processo.numero || !validarCnj(processo.numero)) return null;
  const resumo = processo.datajud;
  const temDataJud = !!aliasTribunal(processo.numero);

  async function viaDataJud(): Promise<Resultado> {
    try {
      const dados = await consultarDataJud(processo.numero, { chave: chave || undefined });
      if (!dados) {
        return {
          tipo: 'erro',
          mensagem: 'DataJud: processo não encontrado. Ele pode ser recente, sigiloso ou ainda não ter sido enviado pelo tribunal.',
        };
      }
      const novos = importarDataJud(processo.id, dados);
      return {
        tipo: 'ok',
        mensagem:
          novos === 0
            ? `DataJud: nenhum andamento novo (${dados.movimentos.length} no total).`
            : `DataJud: ${plural(novos, 'andamento novo', 'andamentos novos')}.`,
      };
    } catch (e) {
      return { tipo: 'erro', mensagem: `DataJud: ${(e as Error).message}` };
    }
  }

  async function viaDiario(): Promise<Resultado> {
    try {
      const publicacoes = await consultarPublicacoes({ numeroProcesso: processo.numero });
      const r = importarPublicacoes(processo.id, publicacoes);
      if (publicacoes.length === 0) return { tipo: 'ok', mensagem: 'Diário (DJEN): nenhuma publicação encontrada.' };
      const prazos = r.prazos > 0 ? ` e ${plural(r.prazos, 'prazo criado', 'prazos criados')} na agenda` : '';
      return {
        tipo: 'ok',
        mensagem:
          r.andamentos === 0
            ? `Diário (DJEN): nenhuma publicação nova (${publicacoes.length} no total).`
            : `Diário (DJEN): ${plural(r.andamentos, 'publicação nova', 'publicações novas')} com o inteiro teor${prazos}.`,
      };
    } catch (e) {
      return { tipo: 'erro', mensagem: `Diário (DJEN): ${(e as Error).message}` };
    }
  }

  async function atualizar() {
    setConsultando(true);
    setResultados([]);
    const consultas = [viaDiario(), ...(temDataJud ? [viaDataJud()] : [])];
    setResultados(await Promise.all(consultas));
    setConsultando(false);
  }

  return (
    <Secao titulo="Andamentos e publicações (CNJ)">
      <Cartao estilo={{ gap: espaco.md }}>
        {resumo ? (
          <>
            <LinhaInfo rotulo="Classe" valor={resumo.classe} />
            <LinhaInfo rotulo="Órgão julgador" valor={resumo.orgaoJulgador} />
            <LinhaInfo rotulo="Assuntos" valor={resumo.assuntos.join(' · ')} />
            <LinhaInfo rotulo="Instâncias" valor={resumo.graus.map(descreverGrau).join(', ')} />
            <Text style={estilos.textoSuave}>DataJud atualizado em {formatarData(diaDoInstante(resumo.atualizadoEm))}.</Text>
          </>
        ) : (
          <Text style={estilos.textoSuave}>
            Busca as movimentações no DataJud e o texto dos despachos, decisões e sentenças publicados no Diário de Justiça
            Eletrônico Nacional (DJEN). Os prazos abertos pelas publicações entram na agenda.
          </Text>
        )}

        {consultando ? (
          <View style={s.carregando}>
            <ActivityIndicator color={cores.primaria} />
            <Text style={estilos.textoSuave}>Consultando o CNJ…</Text>
          </View>
        ) : (
          <Botao
            titulo={resumo ? 'Atualizar andamentos e publicações' : 'Buscar andamentos e publicações'}
            icone="sync-outline"
            variante="secundario"
            aoPressionar={atualizar}
          />
        )}

        {resultados.map((r) => (
          <Aviso key={r.mensagem} tipo={r.tipo} mensagem={r.mensagem} />
        ))}
      </Cartao>
    </Secao>
  );
}

const s = StyleSheet.create({
  carregando: { flexDirection: 'row', gap: espaco.sm, alignItems: 'center', justifyContent: 'center' },
});
