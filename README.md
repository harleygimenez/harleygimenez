# OpenJus — gestão jurídica gratuita e de código aberto

App **gratuito e de código aberto (licença MIT)** de gestão para advogados e escritórios, em **React Native + Expo** (Android, iOS e web). Foi inspirado nas funções de softwares jurídicos como o Astrea, mas é um projeto original: não usa marca, textos, imagens nem código de terceiros.

Os dados ficam **salvos no próprio aparelho**. Se o escritório quiser, ele liga um servidor próprio e gratuito (Supabase) para:

- entrar com **Google ou Microsoft**;
- ter **vários advogados** na mesma conta do escritório;
- sincronizar os dados entre os celulares.

Na primeira abertura o app carrega dados de exemplo; em **Ajustes** dá para restaurá-los ou começar do zero.

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
| **Diário de Justiça (DJEN)** | Busca no Diário de Justiça Eletrônico Nacional (API Comunica PJe, do CNJ) o **texto publicado** de despachos, decisões e sentenças, que aparece na timeline com o link da certidão. Também busca **pelas OABs** do titular e da equipe, e cadastra sozinho os processos e clientes novos (você confirma quem é o cliente). |
| **Prazos automáticos** | Cada publicação importada pode criar na agenda os prazos que abre. Vale o prazo fixado pelo juiz no texto (ex.: "no prazo de 15 (quinze) dias, apresentar réplica"); se não houver, o da lei para o tipo de ato e o rito: contestação, apelação, embargos de declaração, agravo, recurso ordinário (CLT), recurso inominado (Lei 9.099), manifestação (CPC, art. 218, § 3º)… A contagem parte do 1º dia útil após a disponibilização (Lei 11.419/2006, art. 4º) e segue os arts. 219, 220 e 224 do CPC; no processo penal, em dias corridos. Só prazos ainda abertos entram na agenda, e dá para desligar em Ajustes. |
| **Escritório e equipe** | Com o servidor do escritório, cada advogado entra com a conta Google ou Microsoft no próprio celular e vê os mesmos dados. O administrador convida por e-mail, define papéis (administrador, advogado, assistente) e compartilha com a equipe as pastas do Drive/OneDrive configuradas no n8n. A sincronização é automática e junta alterações de pessoas diferentes. Guia em [`nuvem/README.md`](nuvem/README.md). |
| **DataJud (CNJ)** | Pelo número CNJ, busca na API pública do DataJud a classe, o órgão julgador, os assuntos e as movimentações. As movimentações entram como andamentos na timeline, sem duplicar ao atualizar. No cadastro, o botão "Preencher pelo DataJud" preenche título, tribunal e vara. |
| **Google Drive e OneDrive** | Busca arquivos na sua conta e os vincula a processos e clientes. Os arquivos aparecem na timeline e abrem direto no Drive ou no OneDrive. |
| **Modelos de documentos** | Modelos no Google Docs ou no Word (.docx no OneDrive) com campos como `{{cliente.nome}}`, `{{processo.numero}}` e `{{advogado.oab}}`, preenchidos automaticamente e salvos em uma pasta específica. |

A integração com Google Drive/Docs e OneDrive/Word passa por **workflows do n8n chamados via webhook** (as credenciais ficam no n8n, não no celular). O passo a passo está em [`integracoes/n8n/README.md`](integracoes/n8n/README.md).

O DataJud e o Diário (DJEN) são consultados direto pelo app. O DataJud usa a chave pública divulgada pelo CNJ, que dá para trocar em Ajustes › Integrações; o DJEN não precisa de chave.

- Sigilo, atraso de envio pelos tribunais e cobertura dependem do CNJ.
- O DJEN limita as consultas por minuto e pode recusar acessos de fora do Brasil ou de servidores.
- Na versão web, o navegador pode bloquear as consultas se a API do CNJ não liberar CORS. No app Android/iOS isso não acontece.

> Os prazos automáticos são uma **sugestão**. Feriados locais, suspensões do tribunal, prazo em dobro (Fazenda Pública, MP, Defensoria, litisconsortes com advogados diferentes em autos físicos) e audiência de conciliação antes da contestação não são detectados. Confira sempre no processo.

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
npm test           # testes (CNJ, prazos, DataJud, DJEN, Word, login, sincronização e segurança)
npm run testar:nuvem  # regras de acesso (RLS) do banco do escritório num Postgres local
npm run typecheck  # TypeScript
npm run lint       # ESLint
npm run seguranca  # segredos, padrões perigosos, workflows e dependências
```

O relatório de segurança, com os 15 itens verificados e o checklist de produção, está em [SEGURANCA.md](SEGURANCA.md).

Para gerar os instaladores de Android/iOS, use o EAS Build (`npx eas-cli@latest build`).

## Estrutura

```
src/
  app/            rotas (Expo Router): abas, detalhes e formulários
  components/     componentes de interface (cartões, calendário, pipeline, timeline…)
  data/           tipos, store persistente (zustand + AsyncStorage), seletores e dados de exemplo
  lib/            regras puras: número CNJ, datas e prazos, DataJud, DJEN, prazos das publicações, n8n e Supabase
  tema.ts         cores e espaçamentos
integracoes/n8n/  workflows do n8n (Google Drive/Docs e OneDrive/Word), código dos nós e guia
nuvem/            servidor opcional do escritório (Supabase): migração com RLS, testes e guia
```

## Próximos passos sugeridos

- Notificações locais de prazos e audiências (`expo-notifications`).
- Busca automática e periódica das publicações no Diário (hoje é feita ao tocar no botão).
- Feriados estaduais e municipais por tribunal e prazo em dobro configurável por processo.
- Exportar documentos gerados também em PDF, timesheet e relatórios.

## Licença e créditos

O OpenJus é distribuído sob a [licença MIT](LICENSE): pode ser usado, copiado, modificado e redistribuído livremente, inclusive para fins comerciais, desde que o aviso de copyright e a licença acompanhem as cópias. O software é fornecido "como está", sem garantias.

- **Autor e titular:** Harley Gimenez.
- **Desenvolvido com:** [Claude](https://claude.com/claude-code) (Anthropic), assistente de IA que escreveu o código junto com o autor. Os commits registram essa coautoria (`Co-Authored-By`). Pela legislação de direitos autorais, uma IA não pode ser titular, por isso o copyright fica em nome do autor.

Contribuições são bem-vindas por issues e pull requests.
