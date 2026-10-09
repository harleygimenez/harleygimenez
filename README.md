# Causa — gestão jurídica no celular

App de gestão para advogados e escritórios, em **React Native + Expo** (Android, iOS e web), inspirado nas funções de softwares jurídicos como o Astrea. É um projeto original: não usa marca, textos, imagens nem código de terceiros.

Nesta primeira versão os dados ficam **salvos no próprio aparelho** (sem servidor). Na primeira abertura o app carrega dados de exemplo; em **Ajustes** dá para restaurá-los ou começar do zero.

## Funcionalidades

| Módulo | O que faz |
| --- | --- |
| **Início** | Prazos atrasados, de hoje e dos próximos 7 dias, atalhos e resumo financeiro do mês. |
| **Processos** | Cadastro com número CNJ (máscara e validação do dígito verificador), cliente, parte contrária, tribunal, vara, área, valor da causa e situação. Busca por título, número, cliente ou parte. |
| **Pipeline** | Quadro estilo kanban com as fases (Consulta → Petição inicial → Citação/Contestação → Instrução → Sentença → Recurso → Execução → Encerrado). As setas movem o processo de fase. |
| **Timeline do processo** | Linha do tempo que junta andamentos (petições, despachos, decisões, publicações, anotações), prazos/audiências e lançamentos financeiros. Toda mudança de fase é registrada automaticamente. |
| **Agenda** | Calendário mensal com prazos, audiências, tarefas e reuniões, filtros por tipo, prioridade e marcação de concluído. |
| **Calculadora de prazos** | Vencimento em dias úteis ou corridos (CPC, arts. 219, 220 e 224), com feriados nacionais, Carnaval, Sexta-feira Santa, Corpus Christi e recesso de 20/12 a 20/01. Pode ser usada dentro do cadastro de prazo. |
| **Clientes** | Pessoa física ou jurídica (máscaras de CPF/CNPJ e telefone), processos do cliente, próximos compromissos e histórico de atendimentos. |
| **Financeiro** | Receitas (honorários, êxito, reembolso) e despesas (custas, escritório) por mês, com recebido, a receber, vencidos e saldo realizado/previsto. |
| **DataJud (CNJ)** | Pelo número CNJ, busca na API pública do DataJud a classe, o órgão julgador, os assuntos e as movimentações. As movimentações entram como andamentos na timeline, sem duplicar ao atualizar. No cadastro, o botão "Preencher pelo DataJud" preenche título, tribunal e vara. |
| **Google Drive e OneDrive** | Busca arquivos na sua conta e os vincula a processos e clientes. Os arquivos aparecem na timeline e abrem direto no Drive ou no OneDrive. |
| **Modelos de documentos** | Modelos no Google Docs ou no Word (.docx no OneDrive) com campos como `{{cliente.nome}}`, `{{processo.numero}}` e `{{advogado.oab}}`, preenchidos automaticamente e salvos em uma pasta específica. |

A integração com Google Drive/Docs e OneDrive/Word passa por **workflows do n8n chamados via webhook** (as credenciais ficam no n8n, não no celular). O passo a passo está em [`integracoes/n8n/README.md`](integracoes/n8n/README.md).

O DataJud é consultado direto pelo app, com a chave pública divulgada pelo CNJ (dá para trocá-la em Ajustes › Integrações). Sigilo, atraso de envio pelos tribunais e cobertura dependem do CNJ. Na versão web, o navegador pode bloquear a consulta se a API do CNJ não liberar CORS; no app Android/iOS isso não acontece.

> A calculadora não conhece feriados estaduais/municipais nem suspensões específicas de cada tribunal. Confira sempre o calendário do tribunal.

## Como rodar

Requisitos: Node.js 20+ e o app **Expo Go** no celular (ou um emulador).

```bash
npm install
npx expo start        # escaneie o QR code com o Expo Go
npx expo start --web  # ou abra no navegador
```

Verificações:

```bash
npm test           # testes (CNJ, prazos, formatos, seletores e store)
npm run typecheck  # TypeScript
npm run lint       # ESLint
```

Para gerar os instaladores de Android/iOS, use o EAS Build (`npx eas-cli@latest build`).

## Estrutura

```
src/
  app/            rotas (Expo Router): abas, detalhes e formulários
  components/     componentes de interface (cartões, calendário, pipeline, timeline…)
  data/           tipos, store persistente (zustand + AsyncStorage), seletores e dados de exemplo
  lib/            regras puras: número CNJ, datas e prazos, formatação, mesclagem e cliente do n8n
  tema.ts         cores e espaçamentos
integracoes/n8n/  workflows do n8n (Google Drive/Docs e OneDrive/Word), código dos nós e guia
```

## Próximos passos sugeridos

- Sincronização na nuvem e login (ex.: Supabase), com vários usuários por escritório.
- Notificações locais de prazos e audiências (`expo-notifications`).
- Atualização periódica dos andamentos pelo DataJud e monitoramento de publicações em diários oficiais.
- Exportar documentos gerados também em PDF, timesheet e relatórios.
