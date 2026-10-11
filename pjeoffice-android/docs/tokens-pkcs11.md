# Tokens, PKCS#11 e estratégia de suporte amplo

Este documento explica a lista de bibliotecas **PKCS#11** que o PjeOffice (Linux)
usa, como o nosso token se encaixa, e qual é o caminho para suportar **muitas
marcas de token** — separando o que é possível no **Android** e no **Linux**.

## O que é essa lista de `.so`

No computador (Linux/Windows/macOS), o PjeOffice **não fala com o token direto**:
ele carrega a **biblioteca PKCS#11 do fabricante** (o "middleware") e pede a ela
para listar certificados e assinar. A lista de caminhos (`/usr/lib/...`,
`/usr/local/lib/pkcs11/...`, etc.) são só os **lugares onde ele procura** cada
`.so`. Cada `.so` sabe conversar com uma **família de token**.

PKCS#11 é um padrão (Cryptoki): a biblioteca expõe funções como `C_Login`
(PIN), `C_FindObjects` (certificados/chaves) e `C_Sign` (assinatura). Quem
implementa o protocolo específico do chip é o fabricante, dentro do `.so`.

### Mapa (biblioteca → família de token)

| Biblioteca | Família / fabricante | Observação |
| --- | --- | --- |
| `libaetpkss.so*` | **A.E.T. Europe SafeSign** | **É o nosso: G&D StarSign CUT S** |
| `libbit4opki.so`, `libbit4ipki.so`, `libbit4xpki.so` | bit4id (IDEMIA/Oberthur) | comum em e‑CPF/e‑CNPJ |
| `libASEP11.so`, `libOcsCryptoki.so` | Oberthur/IDEMIA AWP (ASEPCOS) | |
| `libcmP11.so`, `libgpkcs11.so*` | Gemalto/Thales (Classic Client) | |
| `libeTPkcs11.so`, `libeToken.so*` | SafeNet eToken (Thales) | |
| `libwdpkcs.so`, `libwdpkcs_icp.so` | WatchData | |
| `libsiecap11.so` | Atos/Siemens CardOS | |
| `libcastle.so*` (ePass2003) | Feitian | |
| `libepsng_p11.so*` | Pronova (NG) | |
| `libneoidp11.so` | NeoID | |
| `libscmccid.so` | SCM Microsystems | |
| `libcoolkeypk11.so` | CoolKey (Red Hat) | |
| `stPKCS11.so` | SmartCard genérico | |
| `opensc-pkcs11.so` | **OpenSC** (genérico) | suporta vários tokens compatíveis |
| `vault-pkcs11.so` (Assistente BirdID) | **BirdID (SoluTI)** | certificado **em nuvem**, não USB |

> O nosso **StarSign CUT S** cai em **`libaetpkss.so` (SafeSign)**. No Android nós
> reimplementamos esse protocolo falando **CCID direto** com o chip — por isso
> funciona sem precisar do `.so`.

## Importante: driver ≠ validação no PJe

Ter o driver certo só garante **assinar**. O erro **"Não foi possível validar o
certificado"** (TRF1, jus.br/SEEU, PDPJ) acontece **depois**, no servidor, e é de
**cadastro/primeiro acesso** do certificado naquele sistema — não de biblioteca.
No nosso caso a assinatura já é válida (o *Diagnóstico* mostra `✔ Assinatura
CONFERE`), então adicionar bibliotecas **não** muda esse resultado.

## Estratégia de suporte amplo a tokens

### Android

Não existe ecossistema PKCS#11 no Android: **esses `.so` não podem ser
carregados** (são binários Linux x86/x64 e dependem de PC/SC do desktop). O
caminho no Android é falar **CCID direto** com o leitor (USB Host) e implementar
o protocolo de cada **família de applet**:

- ✅ **SafeSign / A.E.T. Europe** (StarSign CUT S) — implementado.
- ⏳ Outras famílias (bit4id, eToken, Gemalto, WatchData…) exigiriam implementar
  o applet de cada uma, ou um núcleo compatível com **OpenSC** (PKCS#15 + APDUs
  por família). É trabalhoso, mas é o único caminho nativo no Android.

> Certificados **em nuvem** (BirdID, SafeID, VIDaaS, Remoto ICP) **não usam token
> USB**: são API/OAuth do provedor. Dá para suportar no Android, mas é outro
> fluxo (sem CCID), por provedor.

### Linux (o caminho natural para "amplo")

No Linux a JVM tem o provedor **SunPKCS11**, que carrega **qualquer** `.so` da
lista acima e expõe o token como um `KeyStore`/`Signature` padrão do Java — ou
seja, **suporte amplo com pouco código**, reusando o nosso módulo `core`
(servidor local do PjeOffice, cadeia, HTTP). Esboço:

```
1. Mapear token → .so (como o PjeOffice): tenta libaetpkss, bit4id, eToken, …
2. Provider = SunPKCS11(config apontando para o .so e o slot)
3. KeyStore "PKCS11" → pega certificado + PrivateKey do token
4. Signature.getInstance("SHA256withRSA"/"MD5withRSA").initSign(privKey) → assina
5. ServidorLocal (do core) sobe em 127.0.0.1:8800; o navegador conversa igual
```

Vantagens:
- Suporta **todas as marcas** da lista automaticamente (o fabricante cuida do chip).
- Reusa o `core` inteiro (protocolo do PjeOffice, tarefas, cadeia, redirect 302).
- Para o **StarSign** especificamente, também dá para usar o nosso transporte via
  **PC/SC (`pcscd` + `javax.smartcardio`)** reaproveitando a lógica já pronta.

Resumo: **Android = CCID direto por família (temos SafeSign/StarSign); Linux =
SunPKCS11 sobre os `.so` do fabricante = suporte amplo**. A assinatura em si já
está resolvida; o que varia por tribunal é o **cadastro** do certificado.
