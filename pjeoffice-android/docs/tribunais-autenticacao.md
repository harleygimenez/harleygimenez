# Como cada tribunal exige a autenticação (mapa verificado)

Levantamento feito com `ferramentas/probe-tribunais.ps1` (varredura das páginas
de login) em 2026-10-15, complementado com capturas no navegador. Serve para
saber qual fluxo o app precisa usar em cada tribunal.

## Resumo por modo

### SSO — keycloak, realm `pje` (tarefa `sso.autenticador`)
A página redireciona para
`sso.cloud.pje.jus.br/auth/realms/pje/protocol/openid-connect/auth` com um
`client_id` próprio. O app assina o desafio e o SSO valida. **Suportado.**

| Tribunal | client_id | Observação |
| --- | --- | --- |
| TRF1 1º/2º grau | `pje-trf1-1g` / `pje-trf1-2g` | |
| TRF3 1º/2º grau | — | SSO (probe deu timeout, mas é SSO conhecido) |
| TRF5 2º grau | `pje-trf5-2g` | 1º grau é **clássico** |
| TRF6 1º/2º grau | — | SSO |
| TJBA | `pje-tjba-1g` | |
| TJDFT | `pje-tjdft-1g` | |
| TJMA | `pje-tjma-1g` | |
| TJMT | `pje-tjmt-1g` | |
| TJMG | `pje-tjmg-1g` | |
| TJPA | `pje-tjpa-1g` | |
| TJPB | `pje-tjpb-1g` | |
| TJPE | `pje-tjpe-1g-cloud` | redireciona para `pje.cloud.tjpe.jus.br/1g` |
| TJRJ 1º/2º grau | `pje-tjrj-1g` | |
| **jus.br / PDPJ** | **`jusbr`** | realm `pje`, `redirect_uri=https://www.jus.br` (portal unificado) |

### Clássico — `cnj.autenticador` (MD5withRSA, formulário)
Sem redirecionamento para keycloak; a própria página `logarPJeOffice.seam`
recebe a assinatura. **Suportado e em uso.**

- **TST** — 1º/2º grau (caminho exato a confirmar; o probe usou um path que deu 404)
- **TRT1 a TRT24** — 1º **e** 2º grau — **todos clássicos**
- **TRF5** — 1º grau

### eproc — keycloak próprio do tribunal + broker (fluxo diferente)
O login de certificado passa pelo keycloak do **próprio tribunal**, que faz
*broker* para o `sso.cloud.pje.jus.br`. Não usa o `pjeoffice-rest` direto — por
isso o assinador padrão não "fecha" o login aqui. **Precisa de tratamento
próprio.**

| Tribunal | keycloak | client_id | eproc_client_id |
| --- | --- | --- | --- |
| TJRS 1º/2º grau | `keycloak-eks.tjrs.jus.br` (realm `eproc`) | `cnj.jus.br` | `eproc-tjrs-1g` / `-2g` |
| TJSC 1º grau | `sso.tjsc.jus.br` (realm `eproc`) | `eproc-tjsc-1g` | |
| **TRF2** | — | — | migrou para eproc: `https://eproc.trf2.jus.br/eproc/` |
| TRF4 1º/2º grau | eproc (hosts a confirmar) | | |

> **Por que o TJRS falhava:** não é a assinatura (que é idêntica à referência).
> É o fluxo de login — eproc com keycloak próprio e broker. Entrar aí exige
> seguir o broker do tribunal, não o POST direto ao `pjeoffice-rest`.

### Outros sistemas (não usam o assinador PJe)
- **TJSP** — e-SAJ (`esaj.tjsp.jus.br`)
- **TJPR**, **TJGO** — Projudi

### A revisar (URL/host do probe precisa de ajuste)
TST (path 404), TRF2/TRF3 (timeout/TLS), TRF4 (host eproc), TJAC, TJAL, TJAM,
TJAP, TJES, TJMS, TJPI, TJRN, TJSE, TJTO, TJCE (`/pje1grau/`), TJRO (portal),
TJRR. Rode `ferramentas/probe-tribunais.ps1` e corrija a URL de quem aparecer
com erro, ou capture com `ferramentas/capturar-requisicao.js`.

## O que o app faz hoje

- **SSO (realm `pje`)** e **clássico**: cobertos. O app é agnóstico ao
  `client_id` — ele só responde ao que a página pede pelo protocolo PjeOffice.
- **eproc**: ainda não — é o próximo alvo, por ser um fluxo de login distinto.
