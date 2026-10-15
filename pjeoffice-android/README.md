# Assinador PJe para Android

App Android (APK) que faz no celular o papel do **PJeOffice Pro**: assina com o seu certificado digital ICP-Brasil os pedidos do **PJe** (login com certificado e assinatura de documentos).

> Projeto independente, sem vínculo com o CNJ nem com tribunais. **Login no PJe com token A3 (G&D StarSign CUT S) por USB OTG já foi validado contra o PJe real** (SSO e login clássico). Mesmo assim, use primeiro em situações sem prazo e confira no PJe se o login ou a assinatura deram certo.

> **Status:** ✅ login por certificado funcionando no PJe real com token A3 StarSign (Android, qualquer aparelho ARM). O APK é universal (Kotlin puro, sem bibliotecas nativas nem restrição de ABI), então roda em arm64‑v8a, armeabi‑v7a e x86. Um alvo **Linux** (desktop/mini‑PC) é viável reusando o módulo `core` — veja [Próximos passos](#próximos-passos).

### Onde já foi testado (login com token A3 StarSign por USB OTG)

| Sistema | Instância | Login | Observação |
| --- | --- | --- | --- |
| **TJRJ** | 2º grau | ✅ | `cnj.autenticador` (clássico, MD5withRSA) |
| **TJRO** | 1º grau | ✅ | |
| **TJ** (PJe) | — | ✅ | |
| **CNJ — Corregedoria** | — | ✅ | |
| **PJe SSO** (`sso.cloud.pje.jus.br`) | — | ✅ | `sso.autenticador` (algoritmo da página; sem ele, *two-check* MD5 → SHA-1 → SHA-256) |

> Onde um tribunal recusa com "Não foi possível validar o certificado", costuma ser **cadastro/primeiro acesso do certificado naquele sistema** (lado do servidor), não o app — a assinatura é válida e a cadeia está completa (confirme pelo *Diagnóstico do token*: `✔ Assinatura CONFERE`).

## Por que não dá para "instalar o PJeOffice Pro" no Android

O pacote do PJeOffice Pro para Linux (`pjeoffice-pro.sh`, `pjeoffice-pro.jar`, pasta `jre/` com o Java da Azul Zulu e `ffmpeg.exe`) é um programa de **computador**:

- a interface usa Java Swing/AWT, que não existe no Android;
- o Java embutido (`jre/bin/java`) é compilado para Linux x86/x64, não para os processadores ARM dos celulares;
- o script só sobe esse Java e o `.jar` em segundo plano (`nohup ./jre/bin/java ... -jar pjeoffice-pro.jar`).

Por isso este projeto **reimplementa o protocolo** do PJeOffice em Kotlin, num app Android nativo. Os arquivos `LICENSE`, `ASSEMBLY_EXCEPTION` e `DISCLAIMER` do pacote original são as licenças desse Java (OpenJDK/GPLv2 com exceção de classpath, e o aviso da Azul). Este app não inclui esse Java, então eles não se aplicam aqui.

## Como funciona

O site do PJe conversa com o assinador chamando `http://127.0.0.1:8800/pjeOffice/requisicao/?r=<pedido em JSON>`. O assinador assina e envia o resultado direto para o tribunal. Depois devolve à página uma imagem: GIF 1×1 quando deu certo, PNG 2×1 quando falhou. O app atende esse mesmo protocolo de dois jeitos:

| Modo | Como usar | Observações |
| --- | --- | --- |
| **Navegador do app** (recomendado) | *Abrir o PJe no app* | O app abre o PJe numa WebView e atende as chamadas a `127.0.0.1:8800` antes que saiam do aparelho. A confirmação aparece na própria tela. Envio de arquivos e downloads funcionam. |
| **Chrome** | Ligar *Assinador ativo para o navegador* e abrir o PJe no Chrome | Liga um servidor local em `127.0.0.1:8800`, igual ao do computador. Cada pedido vira uma **notificação**: toque nela para confirmar. O Chrome pode pedir permissão para "acessar a rede local"; permita. |

### Certificados

- **A1 (arquivo `.pfx`/`.p12`):** use *Importar certificado A1*. O arquivo é copiado para a área privada do app e continua protegido pela senha dele. A senha **não é gravada**: fica só na memória até você tocar em *Bloquear* ou o Android fechar o app.
- **Certificado instalado no Android** (Configurações › Segurança › Criptografia e credenciais › Instalar certificado): use *Usar certificado instalado no Android*. A chave privada fica no armazenamento do sistema.
- **A3 (token USB) — G&D StarSign CUT S:** ✅ **funcionando** (login validado no PJe real), por USB OTG, **sem precisar de driver do sistema**. O app fala direto com o leitor (CCID) e com o applet SafeSign do token. Faça primeiro o **Diagnóstico do token** na tela inicial: ele conecta e lê os dados *sem enviar o PIN*, e, se você mandar, faz uma assinatura de teste e confere a assinatura contra a chave pública do seu certificado (`✔ Assinatura CONFERE`). O passo a passo técnico está em [Como o token A3 funciona por dentro](#como-o-token-a3-funciona-por-dentro). Outros modelos de token e certificados em nuvem (BirdID, SafeID, VIDaaS…) ainda não.

> **Cuidado com o PIN do token.** Esses tokens bloqueiam após poucas tentativas de PIN erradas. O app lê o contador de tentativas antes e aborta sozinho se restarem poucas, mas confira o número mostrado antes de digitar o PIN.

**Usar o token no login/assinatura do PJe:** em *Diagnóstico do token*, toque em **Usar este token para assinar no PJe** (lê o certificado sem PIN e define o token como certificado ativo). Depois abra o PJe pelo navegador do app: quando o PJe pedir a assinatura, o app abre o token e pede o PIN na hora. O token só funciona pelo **navegador do app** (em primeiro plano, por causa da permissão de USB); pelo Chrome ainda não.

### Como o token A3 funciona por dentro

O token **G&D StarSign CUT S** é um leitor **CCID** com o applet **SafeSign** (A.E.T. Europe) e um sistema de arquivos **PKCS#15**. O app conversa com ele em APDUs ISO 7816‑4, sem driver do sistema. A sequência completa (toda no código em `core/.../token/`):

1. **Enquadramento CCID** (`Ccid.kt`): os APDUs são embrulhados em mensagens CCID (nível APDU curto, `dwMaxCCIDMessageLength = 271`) e enviados pela API de **USB Host** do Android.
2. **Handshake "DRM"** (`StarSign.abrir`): o applet só libera as operações depois de receber, via `PUT DATA`, a string exata `I am A.E.T. Europe B.V. SafeSign or BlueX approved software.`. Em seguida seleciona o AID PKCS#15 (`A0 00 00 00 63 "PKCS-15"`), abre o **canal lógico 1** (`MANAGE CHANNEL`) e reseleciona o AID nesse canal.
3. **Descoberta PKCS#15:** lê o **ODF** (EF `5031`), que aponta os diretórios: `A0`→PrKDF (`4400`, chaves privadas), `A4`→CDF (`4404`, certificados). Do **CDF** extrai os caminhos de todos os certificados (OCTET STRINGs começando em `3F00`/`3FFF`), que neste token ficam no **DF `4302`**, e lê cada um.
4. **Escolha da folha:** o token pode guardar certificados de **cadeias diferentes** (ex.: CAs da RFB ao lado do certificado da OAB). A folha do titular é escolhida como o certificado **não‑CA** (`basicConstraints == -1`), evitando pegar o topo de uma sub‑cadeia de CAs.
5. **Referência da chave:** o `MSE SET` precisa da `keyReference` real. Em vez de fixar `01` (que dava `6A88` – "dado de referência não encontrado"), o app lê o **PrKDF** (`4400`) e extrai o `keyReference` de verdade (neste token, `00`). O PrKDF é legível **sem PIN**, então isso é feito no `abrir()`.
6. **PIN + reautenticação:** o `VERIFY PIN` usa referência `0x02` (ASCII + preenchimento com `0x00` até 15 bytes). **Particularidade do SafeSign:** cada `SELECT AID` *reseta* a autenticação do PIN. Como ler a cadeia faz vários `SELECT AID`, o app **reenvia o PIN imediatamente antes do `MSE SET`**, sem nenhum `SELECT AID` no meio — isso resolveu o `6982` ("condição de segurança não satisfeita").
7. **Assinatura:** o cartão faz o padding **PKCS#1 v1.5** e a exponenciação RSA, mas **não** monta o `DigestInfo` — então o app monta o `DigestInfo` do algoritmo pedido e envia via `PSO: COMPUTE DIGITAL SIGNATURE` (`00 2A 9E 9A`). Assim o mesmo cartão assina **SHA256withRSA** (login SSO do PJe) **e MD5withRSA** (login clássico `cnj.autenticador`, ex.: TJRJ).
8. **Cadeia enviada ao PJe:** a cadeia é completada (folha → emissoras → raiz) e enviada como **PkiPath** Base64 no campo `certChain`. As CAs vêm do próprio token, de CAs embutidas em `app/src/main/assets/cadeia-icp/` (AC‑OAB G3/G4 e a cadeia RFB) ou, em último caso, baixadas pelo campo **AIA**.

> **PIN guardado:** após o `VERIFY`, o PIN fica em memória **só durante a sessão do token**, para a reautenticação do passo 6, e é zerado em `fechar()`. Nada é persistido.

Uma particularidade do login **clássico** (`cnj.autenticador`): o servidor autentica a sessão e responde **HTTP 302** (redirect para a área logada) — que é o caminho de **sucesso**. O cliente HTTP do app **segue o redirect** carregando os cookies, como o navegador faria.

> Se o PJe recusar com **"Não foi possível validar o certificado"** mesmo com `✔ Assinatura CONFERE` no diagnóstico, o problema é de **cadastro/primeiro acesso do certificado no tribunal** (lado do servidor), não do app: a assinatura é criptograficamente válida e a cadeia está completa.

### Tarefas do PJe suportadas

| `tarefaId` | Para que serve | Situação |
| --- | --- | --- |
| `sso.autenticador` | Login pelo SSO do PJe | ✅ |
| `cnj.autenticador` | Login "clássico" | ✅ |
| `cnj.assinadorHash` | Assinar documentos (o PJe envia o hash) | ✅ |
| `cnj.assinadorBase64` | Assinar conteúdos enviados em Base64 | ✅ |
| `cnj.certchain` | Enviar a cadeia do certificado | ✅ |
| `cnj.assinador` | Baixar arquivos, assinar (CMS/PAdES) e reenviar | ❌ ainda não |
| `util.*`, `pdf.*`, vídeo | Utilitários do PJeOffice para computador | ❌ fora do escopo |

Quando chega uma tarefa não suportada, ela fica no **Registro** da tela inicial. *Copiar detalhes* copia o pedido (sem os cookies de sessão) para você reportar.

### Algoritmo da assinatura no login (MD5withRSA x SHA256withRSA)

A **página do PJe escolhe o algoritmo** pelo campo `algoritmoAssinatura` da tarefa.
Quando a página **não envia** esse campo, o PjeOffice oficial usa **MD5withRSA** —
conferido no código do cliente (`signer4j-pje`, `PjeAutenticatorTask.java`):

```java
params.getAlgoritmoAssinatura()
      .orElse(SignatureAlgorithm.MD5withRSA.getName())   // padrão histórico
```

Este app segue a mesma regra: usa o `algoritmoAssinatura` da página quando ele
vem, e **assume MD5withRSA** quando não vem (caso do SSO do **PDPJ/jus.br/SEEU**,
cuja tarefa chega sem o campo). Sem o campo, o login SSO (`sso.autenticador`)
faz um *two-check* pelos três algoritmos que a referência suporta
(`MD5withRSA`, `SHA1withRSA`, `SHA256withRSA`), **nessa ordem**: só reenvia com
o próximo quando o servidor **recusa de fato** (HTTP de erro, ou JSON
`"success":false`). Uma resposta `2xx` conta como aceita e nunca é
sobrescrita — importante porque o `uuid` do desafio é o mesmo em todos os
envios, então um segundo envio sobre um primeiro já aceito quebraria o login
(regressão que ocorreu quando a verificação marcava como "erro" qualquer corpo
contendo a palavra `error`). O token A3 e os certificados `.pfx` assinam MD5 e
SHA-1 (montamos o DigestInfo em software); o certificado do Android Keychain é a
exceção que não assina MD5.

### Teste A/B: POST do login SSO pela página (modo "navegador")

Em *Diagnóstico do token* há a chave **"SSO: enviar login pelo navegador (teste)"**.
No padrão (desligada), o app faz o POST do login SSO ele mesmo (POST nativo), como
o `PjeWebClient` do PjeOffice clássico. Ligada, o POST é feito pela **própria
página**, via um `fetch` com `credentials: 'include'` — assim a chamada leva os
cookies do keycloak, o `origin` e as credenciais do navegador, como no PjeOffice
Pro em modo extensão (que devolve `{endPoint, pojo}` para a página enviar).

Serve para testar a hipótese do erro "não foi possível validar o certificado" no
PDPJ/jus.br: se o SSO só aceita a chamada vinda do contexto do navegador. Só afeta
o login SSO (`sso.autenticador`); recarregue a página depois de mudar a chave.

### Cadeia de certificados (AC-OAB e ICP-Brasil)

O PJe espera a cadeia do certificado (folha + ACs + raiz). Quando o certificado traz só a folha, o app **completa a cadeia pela rede**: cada certificado ICP-Brasil aponta, no campo AIA, a URL do certificado do emissor no repositório do ITI, então o app segue essas URLs e monta a cadeia inteira (folha → AC-OAB de 2º nível → CAs acima → raiz) sozinho, sem precisar embutir certificados no app. Para o token A3, que já devolve a cadeia completa, nada é baixado. Os certificados baixados ficam em cache na memória.

### Segurança

- Cada pedido mostra um diálogo com o servidor, a tarefa e o certificado; nada é assinado sem você tocar em **Assinar**.
- O `codigoSeguranca` enviado pelo PJe é conferido como no PJeOffice: é decifrado com a chave pública do CNJ (`PJeOffice.cer`) e precisa listar o servidor que fez o pedido. Se não conferir, o app só aceita HTTPS em `*.jus.br`, e mesmo assim mostra um aviso.
- A página que chamou precisa ser do mesmo servidor indicado no pedido (proteção contra CSRF). As assinaturas são enviadas sempre para `servidor + caminho`, nunca para outro host.
- O servidor local escuta só em `127.0.0.1`. O app não tem servidor próprio nem coleta dados.

## Instalar

1. Abra a página **Releases** do repositório no celular e baixe o `.apk` mais recente. Outra opção é baixar o artefato do workflow *Assinador PJe (Android)* na aba **Actions**.
2. Toque no arquivo e permita "instalar apps desta fonte".
3. Abra o **Assinador PJe**, importe o certificado e toque em *Abrir o PJe no app*.

Requer Android 8.0 ou mais novo.

> Sem keystore próprio configurado (veja abaixo), cada build sai assinado com uma chave de debug diferente. Nesse caso, para atualizar é preciso desinstalar a versão anterior.

## Desenvolvimento

```
pjeoffice-android/
  core/   protocolo em Kotlin puro (JSON, tarefas, assinatura RSA, código de segurança, servidor HTTP) + testes JVM
  app/    app Android sem AndroidX: telas, WebView, serviço em primeiro plano, KeyChain/.pfx
```

```bash
cd pjeoffice-android
./gradlew :core:test            # testes do protocolo (não precisa do Android SDK)
./gradlew :app:assembleRelease  # APK (precisa do Android SDK; no CI já vem instalado)
```

O workflow `.github/workflows/assinador-pje-android.yml` roda os testes e gera o APK a cada push que muda esta pasta. Em pushes na `main`, ele também publica o APK em Releases. Para assinar sempre com a mesma chave, crie estes secrets no repositório:

| Secret | Conteúdo |
| --- | --- |
| `ASSINADOR_KEYSTORE_BASE64` | o arquivo `.jks` em Base64 (`base64 -w0 assinador.jks`) |
| `ASSINADOR_KEYSTORE_SENHA` | senha do keystore |
| `ASSINADOR_CHAVE_ALIAS` | alias da chave |
| `ASSINADOR_CHAVE_SENHA` | senha da chave |

Gerar um keystore: `keytool -genkeypair -v -keystore assinador.jks -alias assinador -keyalg RSA -keysize 4096 -validity 10000`.

### Próximos passos

- ✅ Login com token A3 StarSign no PJe real (SSO e clássico) — **feito**.
- Testar assinatura de documentos (`cnj.assinadorHash`/`assinadorBase64`) no fluxo real e ajustar o que aparecer no Registro.
- **Alvo Linux (desktop/mini‑PC, ARM ou x86):** o módulo `core` é Kotlin/JVM puro e já traz o servidor local do PjeOffice, a lógica do token, a cadeia e o cliente HTTP. Para o Linux bastaria um pequeno daemon JVM que suba o `ServidorLocal` e um `Transporte` sobre **PC/SC (`pcscd` via `javax.smartcardio`)** — o navegador no Linux conversa com `127.0.0.1:8800` igual ao Android. Para **suporte amplo a marcas de token** no Linux, o caminho é o **SunPKCS11** sobre as bibliotecas `.so` do fabricante — veja [docs/tokens-pkcs11.md](docs/tokens-pkcs11.md).
- **Outras marcas de token / certificados em nuvem:** a estratégia (CCID direto por família no Android; PKCS#11 no Linux) está documentada em [docs/tokens-pkcs11.md](docs/tokens-pkcs11.md).
- `cnj.assinador` (assinatura CMS/PAdES de arquivos) com BouncyCastle.
- Token A3 StarSign CUT S pelo Chrome (hoje só pelo navegador do app) e, depois, outros modelos de token e certificados em nuvem.

## Créditos

Os formatos do protocolo foram conferidos no código do PJeOffice Pro publicado sob licença MIT por Leonardo de Lima Oliveira: [tomvieira/signer4j-pje](https://github.com/tomvieira/signer4j-pje), [l3onardo-oliv3ira/signer4j](https://github.com/l3onardo-oliv3ira/signer4j) e [l3onardo-oliv3ira/utils4j](https://github.com/l3onardo-oliv3ira/utils4j). Veja [NOTICE.md](NOTICE.md).
