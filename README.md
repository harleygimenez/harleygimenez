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
| **Google Drive** | Busca arquivos na sua conta Google e os vincula a processos e clientes. Os arquivos aparecem na timeline e abrem direto no Drive. |
| **Modelos no Google Docs** | Documentos com campos como `{{cliente.nome}}`, `{{processo.numero}}` e `{{advogado.oab}}`, preenchidos automaticamente e salvos em uma pasta específica do Drive. |

A integração com o Google passa por um **workflow do n8n chamado via webhook** (as credenciais do Google ficam no n8n, não no celular). O passo a passo está em [`integracoes/n8n/README.md`](integracoes/n8n/README.md).

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
integracoes/n8n/  workflow do n8n (Google Drive e Docs) e guia de configuração
```

## Próximos passos sugeridos

- Sincronização na nuvem e login (ex.: Supabase), com vários usuários por escritório.
- Notificações locais de prazos e audiências (`expo-notifications`).
- Importação automática de movimentações pela API pública DataJud do CNJ e monitoramento de publicações em diários oficiais.
- Exportar documentos gerados também em PDF, timesheet e relatórios.
