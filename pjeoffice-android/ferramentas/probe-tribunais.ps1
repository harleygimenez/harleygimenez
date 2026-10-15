# probe-tribunais.ps1
# Mapeia como cada PJe exige a autenticacao: SSO (keycloak) x classico, o
# servidor/realm e o algoritmoAssinatura (quando a pagina expoe).
#
# NAO precisa do token: faz apenas GET nas paginas publicas de login e segue
# redirecionamentos. Rode no Windows (onde a rede alcanca os .jus.br):
#
#   powershell -ExecutionPolicy Bypass -File probe-tribunais.ps1
#
# Saida: uma tabela no console e um CSV em %USERPROFILE%\Desktop\pje-auth-map.csv
# Edite a lista $alvos para incluir/retirar tribunais.

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) probe-pje/1.0"

# A lista e gerada por padrao (loops) para cobrir o pais todo. As URLs sao a
# melhor aproximacao dos padroes conhecidos; a varredura marca o que nao resolve
# (coluna obs/http), entao e so corrigir a URL de quem aparecer com erro.
$alvos = @()
function Alvo($nome, $url) { $script:alvos += @{ nome = $nome; url = $url } }

# --- Justica Federal (TRFs) — 1a e 2a instancia ---
Alvo "TRF1 1g" "https://pje1g.trf1.jus.br/pje/login.seam"
Alvo "TRF1 2g" "https://pje2g.trf1.jus.br/pje/login.seam"
Alvo "TRF2 1g" "https://pje.trf2.jus.br/pje/login.seam"
Alvo "TRF2 2g" "https://pje2g.trf2.jus.br/pje/login.seam"
Alvo "TRF3 1g" "https://pje1g.trf3.jus.br/pje/login.seam"
Alvo "TRF3 2g" "https://pje2g.trf3.jus.br/pje/login.seam"
Alvo "TRF4 1g (eproc)" "https://eproc1g.trf4.jus.br/eproc/"
Alvo "TRF4 2g (eproc)" "https://eproc2g.trf4.jus.br/eproc/"
Alvo "TRF5 1g" "https://pje.trf5.jus.br/pje/login.seam"
Alvo "TRF5 2g" "https://pje2g.trf5.jus.br/pje/login.seam"
Alvo "TRF6 1g" "https://pje1g.trf6.jus.br/pje/login.seam"
Alvo "TRF6 2g" "https://pje2g.trf6.jus.br/pje/login.seam"

# --- Justica do Trabalho: TST + 24 TRTs (primeiro e segundo grau) ---
Alvo "TST 1g" "https://pje.tst.jus.br/primeirograu/login.seam"
Alvo "TST 2g" "https://pje.tst.jus.br/segundograu/login.seam"
1..24 | ForEach-Object {
  Alvo "TRT$_ 1g" "https://pje.trt$_.jus.br/primeirograu/login.seam"
  Alvo "TRT$_ 2g" "https://pje.trt$_.jus.br/segundograu/login.seam"
}

# --- Justica Estadual (TJs) que usam PJe no padrao pje.tjXX.jus.br/pje ---
$tjsPje = "ac","al","ap","am","ba","ce","dft","es","ma","mt","ms","mg","pa","pb","pe","pi","rn","ro","rr","se","to"
$tjsPje | ForEach-Object { Alvo ("TJ" + $_.ToUpper()) "https://pje.tj$_.jus.br/pje/login.seam" }

# --- TJs com host/instancia diferente ou outro sistema (eproc/esaj/projudi) ---
Alvo "TJRJ 1g" "https://tjrj.pje.jus.br/1g/login.seam"
Alvo "TJRJ 2g" "https://tjrj.pje.jus.br/2g/login.seam"
Alvo "TJRS 1g (eproc)" "https://eproc1g.tjrs.jus.br/eproc/"
Alvo "TJRS 2g (eproc)" "https://eproc2g.tjrs.jus.br/eproc/"
Alvo "TJSC 1g (eproc)" "https://eproc1g.tjsc.jus.br/eproc/"
Alvo "TJSP (esaj)" "https://esaj.tjsp.jus.br/esaj/portal.do"
Alvo "TJPR (projudi)" "https://projudi.tjpr.jus.br/projudi/"
Alvo "TJGO (projudi)" "https://projudi.tjgo.jus.br/"

# --- Nacionais / superiores ---
Alvo "SEEU" "https://seeu.pje.jus.br/seeu/"
Alvo "PDPJ/jus.br" "https://portaldeservicos.pdpj.jus.br/"
Alvo "SSO PJe (cloud)" "https://sso.cloud.pje.jus.br/auth/realms/pje/account/"

$resultados = @()

function Primeira($texto, $regex) {
  $m = [regex]::Match($texto, $regex, "IgnoreCase")
  if ($m.Success) { return $m.Groups[1].Value } else { return "" }
}

foreach ($a in $alvos) {
  $linha = [ordered]@{
    tribunal = $a.nome; url = $a.url; http = ""; urlFinal = "";
    modo = ""; realm = ""; clientId = ""; algoritmo = ""; obs = ""
  }
  try {
    $r = Invoke-WebRequest -Uri $a.url -UserAgent $ua -MaximumRedirection 6 -TimeoutSec 25 -UseBasicParsing -ErrorAction Stop
    $linha.http = [int]$r.StatusCode
    $linha.urlFinal = $r.BaseResponse.ResponseUri.AbsoluteUri
    $corpo = "$($r.Content)"

    $ehSso = ($linha.urlFinal -match "sso\.cloud\.pje\.jus\.br|/realms/|/protocol/openid-connect/auth") -or ($corpo -match "keycloak")
    $ehClassico = ($corpo -match "logarPJeOffice|pjeOffice|8800")

    if ($ehSso) { $linha.modo = "SSO (keycloak)" }
    elseif ($ehClassico) { $linha.modo = "classico" }
    else { $linha.modo = "indefinido" }

    $linha.realm = Primeira $linha.urlFinal "/realms/([^/]+)/"
    $linha.clientId = Primeira $linha.urlFinal "client_id=([^&]+)"
    # algoritmoAssinatura costuma estar no JS da pagina de login
    $linha.algoritmo = Primeira $corpo "algoritmoAssinatura['""]?\s*[:=]\s*['""]([A-Za-z0-9]+withRSA)"
  }
  catch {
    $resp = $_.Exception.Response
    if ($resp -and $resp.StatusCode) { $linha.http = [int]$resp.StatusCode }
    $linha.obs = $_.Exception.Message.Split("`n")[0]
  }

  $obj = New-Object psobject -Property $linha
  $resultados += $obj
  "{0,-16} http={1,-4} modo={2,-16} alg={3,-14} {4}" -f $a.nome, $linha.http, $linha.modo, $linha.algoritmo, $linha.urlFinal | Write-Host
  Start-Sleep -Milliseconds 700   # educado com os servidores
}

$csv = Join-Path ([Environment]::GetFolderPath("Desktop")) "pje-auth-map.csv"
$resultados | Export-Csv -Path $csv -NoTypeInformation -Encoding UTF8
Write-Host ""
Write-Host "CSV salvo em: $csv"
