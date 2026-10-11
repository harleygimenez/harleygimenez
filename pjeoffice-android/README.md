# Assinador PJe para Android

App Android (APK) que faz no celular o papel do **PJeOffice Pro**: assina com o seu certificado digital ICP-Brasil os pedidos do **PJe** (login com certificado e assinatura de documentos).

> Projeto independente, sem vínculo com o CNJ nem com tribunais. **Ainda não foi testado contra um PJe real.** Use primeiro em situações sem prazo e confira no PJe se o login ou a assinatura deram certo.

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
- **A3 (token USB) — G&D StarSign CUT S:** suporte **em testes**, por USB OTG, sem precisar de driver do sistema. O app fala direto com o leitor (CCID) e com o applet SafeSign do token. Faça primeiro o **Diagnóstico do token** na tela inicial: ele conecta e lê os dados *sem enviar o PIN*, e só faz a assinatura de teste se você mandar. Outros modelos de token e certificados em nuvem (BirdID, SafeID, VIDaaS…) ainda não.

> **Cuidado com o PIN do token.** Esses tokens bloqueiam após poucas tentativas de PIN erradas. O app lê o contador de tentativas antes e aborta sozinho se restarem poucas, mas confira o número mostrado antes de digitar o PIN.

**Usar o token no login/assinatura do PJe:** em *Diagnóstico do token*, toque em **Usar este token para assinar no PJe** (lê o certificado sem PIN e define o token como certificado ativo). Depois abra o PJe pelo navegador do app: quando o PJe pedir a assinatura, o app abre o token e pede o PIN na hora. O token só funciona pelo **navegador do app** (em primeiro plano, por causa da permissão de USB); pelo Chrome ainda não.

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

- Testar login e assinatura em PJe reais (TRF, TRT, TJ) e ajustar o que aparecer no Registro.
- `cnj.assinador` (assinatura CMS/PAdES de arquivos) com BouncyCastle.
- Token A3 StarSign CUT S pelo Chrome (hoje só pelo navegador do app) e, depois, outros modelos de token e certificados em nuvem.

## Créditos

Os formatos do protocolo foram conferidos no código do PJeOffice Pro publicado sob licença MIT por Leonardo de Lima Oliveira: [tomvieira/signer4j-pje](https://github.com/tomvieira/signer4j-pje), [l3onardo-oliv3ira/signer4j](https://github.com/l3onardo-oliv3ira/signer4j) e [l3onardo-oliv3ira/utils4j](https://github.com/l3onardo-oliv3ira/utils4j). Veja [NOTICE.md](NOTICE.md).
