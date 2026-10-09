/**
 * Confere o app contra as APIs REAIS do CNJ, usando as respostas baixadas pelo workflow
 * "Consulta real ao CNJ" (.github/workflows/consulta-cnj.yml). Não roda no `npm test`:
 *   npx jest --testMatch '<rootDir>/scripts/cnj-real/*.real.js'
 * Variáveis: PASTA_CNJ (pasta com djen-oab.json, djen-processo.json e datajud.json).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { agruparPorProcesso, sugerirCliente } from '../../src/data/importacao';
import { converterResposta } from '../../src/lib/datajud';
import { andamentoDaPublicacao, converterRespostaDJEN } from '../../src/lib/djen';
import { formatarData } from '../../src/lib/datas';
import { sugerirPrazos } from '../../src/lib/prazosPublicacao';

const pasta = process.env.PASTA_CNJ ?? 'cnj';
const ler = (nome) => {
  const caminho = join(pasta, nome);
  if (!existsSync(caminho)) return null;
  const texto = readFileSync(caminho, 'utf8');
  try {
    return JSON.parse(texto);
  } catch {
    return { naoJson: texto.slice(0, 300) };
  }
};
const linhas = [];
const log = (t = '') => {
  linhas.push(t);
};
afterAll(() => console.log(linhas.join('\n')));

function resumirDJEN(rotulo, json) {
  log(`\n=== ${rotulo} ===`);
  if (json.naoJson) {
    log(`Resposta não é JSON: ${json.naoJson}`);
    return [];
  }
  const itens = json.items ?? json.itens ?? [];
  log(`count=${json.count ?? json.total} itens na página=${itens.length}`);
  if (itens[0]) log(`campos do 1º item: ${Object.keys(itens[0]).sort().join(', ')}`);
  const { publicacoes } = converterRespostaDJEN(json);
  log(`publicações lidas pelo app: ${publicacoes.length}`);
  for (const p of publicacoes.slice(0, 15)) {
    const a = andamentoDaPublicacao(p);
    log(`\n- ${formatarData(p.dataDisponibilizacao)} · ${p.tribunal} · ${p.numeroProcesso.replace(/^(\d{7})(\d{2})(\d{4})(\d)(\d{2})(\d{4})$/, '$1-$2.$3.$4.$5.$6')}`);
    log(`  ${a.descricao} → tipo "${a.tipo}" · classe: ${p.classe}`);
    log(`  texto (${p.texto.length} caracteres): ${p.texto.replace(/\s+/g, ' ').slice(0, 220)}…`);
    log(`  certidão: ${p.certidao ? 'sim' : 'não'} · link do tribunal: ${p.link ? 'sim' : 'não'} · partes: ${p.destinatarios.length} · advogados: ${p.advogados.map((x) => `${x.oab}/${x.uf}`).join(', ')}`);
    for (const prazo of sugerirPrazos(p)) {
      log(`  prazo sugerido: ${prazo.titulo} — ${prazo.dias} ${prazo.diasUteis ? 'dias úteis' : 'dias corridos'}, vence ${formatarData(prazo.vencimento)} (${prazo.origem === 'texto' ? 'fixado no texto' : prazo.fundamento})`);
    }
  }
  return publicacoes;
}

it('lê as respostas reais do CNJ', () => {
  const oab = ler('djen-oab.json');
  if (oab) {
    const pubs = resumirDJEN(`DJEN pela OAB ${process.env.OAB}/${process.env.UF}`, oab);
    const grupos = agruparPorProcesso(pubs);
    log(`\nprocessos distintos: ${grupos.length}`);
    for (const g of grupos) log(`- ${g.numero}: ${g.publicacoes.length} publicação(ões) · cliente sugerido: ${sugerirCliente(g) ? '(parte identificada)' : '(nenhuma parte)'} · ${g.orgao}`);
  }
  const proc = ler('djen-processo.json');
  if (proc) resumirDJEN(`DJEN pelo processo ${process.env.PROCESSO}`, proc);

  const dj = ler('datajud.json');
  if (dj) {
    log(`\n=== DataJud ${process.env.PROCESSO} ===`);
    const p = dj.naoJson ? null : converterResposta(dj);
    if (!p) log(`não encontrado ou resposta inesperada: ${JSON.stringify(dj).slice(0, 300)}`);
    else {
      log(`${p.tribunal} · ${p.classe} · ${p.orgaoJulgador} · graus ${p.graus.join(', ')} · ${p.movimentos.length} movimentos`);
      for (const m of p.movimentos.slice(0, 8)) log(`- ${formatarData(m.data)} ${m.nome}${m.descricao ? ` (${m.descricao})` : ''}`);
    }
  }
  expect(true).toBe(true);
});
