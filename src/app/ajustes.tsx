import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Text } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Botao, Cartao, Secao, Tela, estilos } from '../components/ui';
import { useDados } from '../data/store';
import { confirmar } from '../lib/confirmar';
import { espaco } from '../tema';

export default function Ajustes() {
  const carregarExemplo = useDados((s) => s.carregarExemplo);
  const apagarTudo = useDados((s) => s.apagarTudo);
  const integracao = useDados((s) => s.integracao);
  const equipe = useDados((s) => s.equipe.length);
  const totais = useDados(
    useShallow((s) => ({
      clientes: s.clientes.length,
      processos: s.processos.length,
      compromissos: s.compromissos.length,
      lancamentos: s.lancamentos.length,
      modelos: s.modelos.length,
    })),
  );

  return (
    <Tela>
      <Secao titulo="Seus dados">
        <Cartao estilo={{ gap: espaco.sm }}>
          <Text style={estilos.texto}>
            {totais.clientes} clientes · {totais.processos} processos · {totais.compromissos} compromissos ·{' '}
            {totais.lancamentos} lançamentos
          </Text>
          <Text style={estilos.textoSuave}>
            Os dados ficam salvos apenas neste aparelho. Ao desinstalar o app ou limpar os dados do navegador, eles
            são perdidos. Restaurar ou apagar mantém seus modelos e a integração.
          </Text>
        </Cartao>
      </Secao>

      <Secao titulo="Escritório">
        <Botao
          titulo="Publicações no Diário (DJEN)"
          icone="newspaper-outline"
          variante="secundario"
          aoPressionar={() => router.push('/publicacoes')}
        />
        <Botao
          titulo={`Equipe do escritório (${equipe + 1} ${equipe === 0 ? 'advogado' : 'advogados'})`}
          icone="people-outline"
          variante="secundario"
          aoPressionar={() => router.push('/equipe')}
        />
      </Secao>

      <Secao titulo="Integrações">
        <Botao
          titulo={
            [integracao.google.webhookUrl && 'Google Drive', integracao.onedrive.webhookUrl && 'OneDrive']
              .filter(Boolean)
              .join(' e ') || 'Google Drive, OneDrive e DataJud'
          }
          icone="link-outline"
          variante="secundario"
          aoPressionar={() => router.push('/integracoes')}
        />
        <Botao
          titulo={`Modelos de documentos (${totais.modelos})`}
          icone="documents-outline"
          variante="secundario"
          aoPressionar={() => router.push('/modelos')}
        />
      </Secao>

      <Secao titulo="Dados de exemplo">
        <Botao
          titulo="Restaurar dados de exemplo"
          icone="refresh"
          variante="secundario"
          aoPressionar={() =>
            confirmar('Restaurar exemplo?', 'Tudo o que você cadastrou será substituído pelos dados de exemplo.', () => {
              carregarExemplo();
              router.dismissTo('/');
            }, 'Restaurar')
          }
        />
        <Botao
          titulo="Começar do zero"
          icone="trash-outline"
          variante="perigo"
          aoPressionar={() =>
            confirmar('Apagar tudo?', 'Clientes, processos, agenda e financeiro serão apagados.', () => {
              apagarTudo();
              router.dismissTo('/');
            }, 'Apagar tudo')
          }
        />
      </Secao>

      <Text style={[estilos.textoSuave, { textAlign: 'center' }]}>OpenJus · versão {Constants.expoConfig?.version} · software livre (licença MIT)</Text>
    </Tela>
  );
}
