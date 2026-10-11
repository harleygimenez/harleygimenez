# Avisos de terceiros

Este projeto não copia código-fonte do PJeOffice Pro. Partes do protocolo e alguns dados foram conferidos ou reproduzidos a partir de projetos sob licença MIT:

- Certificado público "PJe" do CNJ (`PJeOffice.cer`), embutido em `core/.../CodigoSeguranca.kt`, e as imagens de resposta (GIF 1×1 e PNG 2×1) de `PjeWebTaskResponse`, ambos de **signer4j-pje** — https://github.com/tomvieira/signer4j-pje
- Nomes de tarefas, campos e regras de verificação conferidos em **signer4j-pje**, **signer4j** (https://github.com/l3onardo-oliv3ira/signer4j) e **utils4j** (https://github.com/l3onardo-oliv3ira/utils4j).

- **Protocolo do token G&D StarSign CUT S** (handshake do applet SafeSign, canal lógico, VERIFY PIN, MSE SET, PSO COMPUTE DIGITAL SIGNATURE e os endereços dos arquivos PKCS#15), em `core/.../token/StarSign.kt`, conferido em **starsign-driver** (licença LGPL-2.1), que documenta APDUs reais capturados do SafeSign 4.7 — https://github.com/DiegoRibeirodeSouza/starsign-driver. Este projeto reimplementa o protocolo em Kotlin; não copia o código C do driver. A string do handshake é um dado de interoperabilidade do applet, não um segredo.

O starsign-driver está sob LGPL-2.1 (ver o repositório). Os projetos signer4j estão sob a licença MIT:

```
MIT License

Copyright (c) 2022 Leonardo de Lima Oliveira

https://github.com/l3onardo-oliv3ira

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
