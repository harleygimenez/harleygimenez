# Ferramentas de diagnóstico

Como cada tribunal exige a autenticação do PJe (SSO × clássico, algoritmo da
assinatura). Rode no **Windows** (a rede precisa alcançar os `.jus.br`).

## 1. `probe-tribunais.ps1` — varredura (sem token)

Classifica cada tribunal e extrai o `algoritmoAssinatura` quando a página o expõe.

```powershell
powershell -ExecutionPolicy Bypass -File probe-tribunais.ps1
```

Gera uma tabela no console e `pje-auth-map.csv` na Área de Trabalho. Edite a
lista `$alvos` no topo do script para incluir/retirar tribunais.

## 2. `capturar-requisicao.js` — captura exata (no navegador)

A verdade do servidor: o JSON que a página manda ao PjeOffice ao clicar
"entrar com certificado". Abra a página de login do tribunal, pressione **F12 →
Console**, cole o conteúdo de `capturar-requisicao.js` e tecle Enter **antes** de
clicar em entrar. O console mostra `tarefaId`, `servidor`, `enviarPara` e o
`algoritmoAssinatura` (ou "ausente → padrão MD5withRSA").

Só observa a chamada que a própria página já faria; não envia nada a mais.
