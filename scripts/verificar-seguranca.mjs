// Verificação de segurança do repositório (estática).
// Uso: npm run seguranca            (código, workflows e dependências)
//      npm run seguranca -- dist    (também varre o bundle web gerado por `npx expo export -p web`)
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const raiz = new URL('..', import.meta.url).pathname;
let falhas = 0;
let avisos = 0;
const ok = (msg) => console.log(`OK    ${msg}`);
const falha = (msg) => {
  falhas++;
  console.log(`FALHA ${msg}`);
};
const aviso = (msg) => {
  avisos++;
  console.log(`AVISO ${msg}`);
};

function arquivos(dir, extensoes) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (nome === 'node_modules' || nome.startsWith('.')) return [];
    if (statSync(caminho).isDirectory()) return arquivos(caminho, extensoes);
    return extensoes.some((e) => nome.endsWith(e)) ? [caminho] : [];
  });
}
const ler = (f) => readFileSync(f, 'utf8');
const rel = (f) => relative(raiz, f);

// ---------------------------------------------------------------------------
// 1. Chaves de API / segredos no código e no frontend
// ---------------------------------------------------------------------------
// A chave do DataJud é pública por natureza (divulgada pelo CNJ na wiki da API).
const PERMITIDOS = ['cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=='];
const PADROES_SEGREDO = [
  ['chave AWS', /AKIA[0-9A-Z]{16}/],
  ['chave Google API', /AIza[0-9A-Za-z_-]{35}/],
  ['token GitHub', /gh[pousr]_[0-9A-Za-z]{36}/],
  ['token Slack', /xox[abprs]-[0-9A-Za-z-]{10,}/],
  // \b evita falsos positivos como "task-outline" (nomes de ícones).
  ['chave OpenAI/Anthropic', /\bsk-(?:ant-[a-z0-9]+-|proj-)?[0-9A-Za-z_-]{32,}/],
  ['chave privada', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['segredo do Google OAuth', /GOCSPX-[0-9A-Za-z_-]{20,}/],
  // A chave real tem 20+ caracteres aleatórios após o prefixo. O "_" logo depois evita o falso
  // positivo do bundle Hermes, que guarda as strings coladas (ex.: "sb_secret_" + "_self…").
  ['chave secreta do Supabase', /\bsb_secret_[0-9A-Za-z-][0-9A-Za-z_-]{19,}/],
  // JWT cujo conteúdo traz "role":"service_role" (eyJyb2xlIjoic2VydmljZV9yb2xl… em base64).
  ['chave service_role do Supabase', /eyJ[\w-]*\.[\w-]*c2VydmljZV9yb2xl[\w-]*\.[\w-]+/],
  ['segredo atribuído no código', /\b(?:api[_-]?key|secret|password|senha|client[_-]?secret|token)\b\s*[:=]\s*['"`][^'"`\s]{16,}['"`]/i],
];

function varrerSegredos(lista, rotulo) {
  let encontrados = 0;
  for (const f of lista) {
    let texto = ler(f);
    for (const p of PERMITIDOS) texto = texto.split(p).join('');
    for (const [nome, padrao] of PADROES_SEGREDO) {
      const achado = texto.match(padrao);
      if (achado) {
        encontrados++;
        falha(`${rotulo}: possível ${nome} em ${rel(f)}: ${achado[0].slice(0, 24)}…`);
      }
    }
  }
  if (!encontrados) ok(`${rotulo}: nenhum segredo encontrado (${lista.length} arquivos)`);
}

// Testes ficam de fora: usam tokens fictícios de propósito.
const codigo = [
  ...arquivos(join(raiz, 'src'), ['.ts', '.tsx', '.js']).filter((f) => !f.includes('__tests__')),
  ...arquivos(join(raiz, 'integracoes'), ['.js', '.mjs', '.json']),
  ...arquivos(join(raiz, 'nuvem'), ['.sql', '.mjs', '.md', '.toml']),
  join(raiz, 'app.json'),
];
varrerSegredos(codigo, 'código-fonte');

const pastaBuild = process.argv[2];
if (pastaBuild) {
  const bundle = arquivos(join(raiz, pastaBuild), ['.js', '.html', '.json', '.map', '.bundle']);
  if (bundle.length) varrerSegredos(bundle, `bundle web (${pastaBuild})`);
  else falha(`pasta de build ${pastaBuild} vazia ou inexistente`);
}

// ---------------------------------------------------------------------------
// Padrões perigosos no código do app
// ---------------------------------------------------------------------------
const doApp = arquivos(join(raiz, 'src'), ['.ts', '.tsx']).filter((f) => !f.includes('__tests__'));
const PERIGOSOS = [
  ['eval/new Function (execução de código)', /\beval\s*\(|new Function\s*\(/],
  ['HTML sem escape (XSS)', /dangerouslySetInnerHTML|innerHTML\s*=/],
  ['Math.random para IDs (previsível)', /Math\.random\(\)/],
  ['localStorage direto (use lib/segredos)', /\blocalStorage\s*[.[]/],
  ['console.log de dados (vazamento em produção)', /console\.log\(/],
];
for (const [nome, padrao] of PERIGOSOS) {
  const onde = doApp.filter((f) => padrao.test(ler(f)));
  if (onde.length) falha(`${nome}: ${onde.map(rel).join(', ')}`);
  else ok(`sem ${nome}`);
}

const store = ler(join(raiz, 'src/data/store.ts'));
if (/integracao:\s*semTokens\(s\.integracao\)/.test(store)) ok('tokens dos webhooks fora do armazenamento persistido');
else falha('partialize do store deve remover os tokens (semTokens)');

const nuvem = ler(join(raiz, 'src/data/nuvem.ts'));
const persistidoNuvem = nuvem.match(/partialize: \(s\) => \(\{([\s\S]*?)\}\)/)?.[1] ?? '';
if (persistidoNuvem && !/sessao|token/i.test(persistidoNuvem)) ok('sessão do escritório (Supabase) fora do armazenamento persistido');
else falha('src/data/nuvem.ts: partialize não pode incluir a sessão ou tokens');

// RLS em todas as tabelas do banco do escritório (o teste completo é npm run testar:nuvem).
for (const f of arquivos(join(raiz, 'nuvem/supabase/migrations'), ['.sql'])) {
  const sql = ler(f).replace(/--.*$/gm, '');
  const tabelas = [...sql.matchAll(/create table (?:if not exists )?([\w.]+)/gi)].map((m) => m[1]);
  const semRls = tabelas.filter((t) => !new RegExp(`alter table ${t.replace('.', '\\.')} enable row level security`, 'i').test(sql));
  const perigosas = [...sql.matchAll(/security definer(?![^;]*set search_path)/gi)].length;
  if (semRls.length) falha(`${rel(f)}: tabelas sem RLS: ${semRls.join(', ')}`);
  else if (perigosas) falha(`${rel(f)}: função SECURITY DEFINER sem search_path fixo`);
  else if (/grant [^;]* to anon/i.test(sql)) falha(`${rel(f)}: permissão concedida ao papel anon`);
  else ok(`${rel(f)}: RLS em ${tabelas.length} tabelas, funções com search_path fixo, nada para anon`);
}

if (/export function ErrorBoundary/.test(ler(join(raiz, 'src/app/_layout.tsx')))) ok('ErrorBoundary sem stack trace em produção');
else falha('src/app/_layout.tsx deve exportar um ErrorBoundary próprio');

// ---------------------------------------------------------------------------
// Workflows do n8n
// ---------------------------------------------------------------------------
for (const nome of ['openjus-google-drive.json', 'openjus-onedrive.json']) {
  const wf = JSON.parse(ler(join(raiz, 'integracoes/n8n', nome)));
  const nos = wf.nodes;
  const webhooks = nos.filter((n) => n.type === 'n8n-nodes-base.webhook');
  const prob = [];
  for (const w of webhooks) {
    if (w.parameters.authentication !== 'headerAuth') prob.push('webhook sem autenticação');
    const origens = w.parameters.options?.allowedOrigins;
    if (!origens || origens.trim() === '*') prob.push('CORS liberado para qualquer origem');
  }
  const validar = nos.find((n) => n.name === 'Validar pedido')?.parameters.jsCode ?? '';
  if (!/limitarTaxa\(\)/.test(validar)) prob.push('sem limite de requisições');
  if (!/validarCampos\(/.test(validar)) prob.push('campos de mesclagem sem validação');
  for (const n of nos.filter((x) => x.type === 'n8n-nodes-base.httpRequest')) {
    if (n.parameters.authentication !== 'predefinedCredentialType') prob.push(`${n.name} sem credencial gerenciada`);
    if (n.onError !== 'continueErrorOutput') prob.push(`${n.name} sem tratamento de erro`);
    if (!/^=?https:\/\/|^=\{\{/.test(n.parameters.url)) prob.push(`${n.name} com URL não https`);
  }
  if (nos.some((n) => n.credentials && Object.values(n.credentials).some((c) => c.id))) prob.push('ID de credencial embutido');
  if (prob.length) falha(`${nome}: ${prob.join('; ')}`);
  else ok(`${nome}: autenticação, CORS restrito, limite de taxa, validação e erros tratados`);
}

// ---------------------------------------------------------------------------
// 14. Dependências vulneráveis
// ---------------------------------------------------------------------------
// Avisos já avaliados (ver SEGURANCA.md): ferramentas de build/teste fora do app,
// e decode-uri-component (DoS local via link malicioso; correção só no Expo SDK 58).
const ACEITOS = new Set(['braces', 'node-forge', 'sprintf-js', 'uuid', 'decode-uri-component']);
try {
  let saida;
  try {
    saida = execFileSync('npm', ['audit', '--json'], { cwd: raiz, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch (e) {
    saida = e.stdout?.toString() ?? '';
  }
  const vulns = JSON.parse(saida).vulnerabilities ?? {};
  const raizes = Object.entries(vulns).filter(([, v]) => v.via.some((x) => typeof x === 'object'));
  const novas = raizes.filter(([nome]) => !ACEITOS.has(nome));
  const criticas = raizes.filter(([, v]) => v.severity === 'critical');
  if (criticas.length) falha(`dependências com vulnerabilidade crítica: ${criticas.map(([n]) => n).join(', ')}`);
  if (novas.length) falha(`vulnerabilidades novas, ainda não avaliadas: ${novas.map(([n, v]) => `${n} (${v.severity})`).join(', ')}`);
  if (!criticas.length && !novas.length) ok(`dependências: só avisos já avaliados (${raizes.map(([n]) => n).join(', ') || 'nenhum'})`);
} catch {
  aviso('não foi possível rodar npm audit (sem rede?)');
}

console.log(`\n${falhas} falha(s), ${avisos} aviso(s).`);
process.exit(falhas ? 1 : 0);
