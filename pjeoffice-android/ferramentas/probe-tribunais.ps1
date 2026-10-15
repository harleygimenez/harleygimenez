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

$alvos = @(
  # --- Federais ---
  @{ nome = "TRF1 1g"; url = "https://pje1g.trf1.jus.br/pje/login.seam" }
  @{ nome = "TRF1 2g"; url = "https://pje2g.trf1.jus.br/pje/login.seam" }
  @{ nome = "TRF2";    url = "https://pje.trf2.jus.br/pje/login.seam" }
  @{ nome = "TRF3 1g"; url = "https://pje1g.trf3.jus.br/pje/login.seam" }
  @{ nome = "TRF3 2g"; url = "https://pje2g.trf3.jus.br/pje/login.seam" }
  @{ nome = "TRF4";    url = "https://pje.trf4.jus.br/pje/login.seam" }
  @{ nome = "TRF5";    url = "https://pje.trf5.jus.br/pje/login.seam" }
  @{ nome = "TRF6 1g"; url = "https://pje1g.trf6.jus.br/pje/login.seam" }
  # --- Superiores / nacionais ---
  @{ nome = "TST";     url = "https://pje.tst.jus.br/primeirograu/login.seam" }
  @{ nome = "SEEU";    url = "https://seeu.pje.jus.br/seeu/" }
  @{ nome = "PDPJ/jus.br"; url = "https://portaldeservicos.pdpj.jus.br/" }
  # --- Trabalho (amostra; ajuste trtN conforme precisar) ---
  @{ nome = "TRT1 (RJ) 1g"; url = "https://pje.trt1.jus.br/primeirograu/login.seam" }
  @{ nome = "TRT2 (SP) 1g"; url = "https://pje.trt2.jus.br/primeirograu/login.seam" }
  @{ nome = "TRT3 (MG) 1g"; url = "https://pje.trt3.jus.br/primeirograu/login.seam" }
  @{ nome = "TRT4 (RS) 1g"; url = "https://pje.trt4.jus.br/primeirograu/login.seam" }
  @{ nome = "TRT15 (CAMP) 1g"; url = "https://pje.trt15.jus.br/primeirograu/login.seam" }
  # --- Estaduais (amostra) ---
  @{ nome = "TJMG 1g"; url = "https://pje.tjmg.jus.br/pje/login.seam" }
  @{ nome = "TJDFT 1g"; url = "https://pje.tjdft.jus.br/pje/login.seam" }
  @{ nome = "TJRJ 1g"; url = "https://tjrj.pje.jus.br/1g/login.seam" }
  @{ nome = "TJRJ 2g"; url = "https://tjrj.pje.jus.br/2g/login.seam" }
  @{ nome = "TJBA 1g"; url = "https://pje.tjba.jus.br/pje/login.seam" }
  @{ nome = "TJPE 1g"; url = "https://pje.tjpe.jus.br/1g/login.seam" }
  @{ nome = "TJCE 1g"; url = "https://pje.tjce.jus.br/pje1grau/login.seam" }
  @{ nome = "TJRS (eproc)"; url = "https://eproc1g.tjrs.jus.br/eproc/" }
)

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
