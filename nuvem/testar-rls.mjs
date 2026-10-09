// Testa a migração do Supabase num Postgres local (PGlite), simulando o schema "auth"
// e os papéis anon/authenticated do Supabase. Uso: npm run testar:nuvem
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migracao = readFileSync(new URL('./supabase/migrations/20261009000000_openjus.sql', import.meta.url), 'utf8');
const db = new PGlite();

await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`);
await db.exec(migracao);

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';
await db.query(`insert into auth.users values ($1, 'ana@exemplo.com', now()), ($2, 'bruno@exemplo.com', now()), ($3, 'carla@exemplo.com', null)`, [A, B, C]);

let falhas = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK   ' : 'FALHA'} ${msg}`);
  if (!cond) falhas++;
};

/** Executa como um usuário (ou anônimo) e devolve as linhas ou o erro. */
async function como(usuario, sql, params = []) {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [usuario ?? '']);
  await db.exec(`set role ${usuario ? 'authenticated' : 'anon'}`);
  try {
    return { linhas: (await db.query(sql, params)).rows };
  } catch (e) {
    return { erro: e.message, codigo: e.code };
  } finally {
    await db.exec('reset role');
  }
}

// Sem login, nada.
for (const tabela of ['escritorios', 'membros', 'convites', 'dados_escritorio', 'config_escritorio']) {
  ok((await como(null, `select * from public.${tabela}`)).erro, `anônimo não lê ${tabela}`);
}
ok((await como(null, `select public.criar_escritorio('X')`)).erro, 'anônimo não cria escritório');

// Escritório da Ana.
const criado = await como(A, `select public.criar_escritorio('Gimenez Advocacia', 'Ana', '12345', 'es') as id`);
const E = criado.linhas?.[0]?.id;
ok(!!E, 'usuária verificada cria o escritório');
ok((await como(A, `select papel, uf_oab from public.membros where escritorio_id = $1`, [E])).linhas?.[0]?.papel === 'admin', 'quem cria é administrador');
ok((await como(C, `select public.criar_escritorio('Sem verificar')`)).codigo === '42501', 'e-mail não verificado não cria escritório');

// Isolamento entre usuários.
ok((await como(B, `select * from public.escritorios`)).linhas?.length === 0, 'outro usuário não vê o escritório');
ok((await como(B, `select * from public.dados_escritorio`)).linhas?.length === 0, 'outro usuário não vê os dados');
ok((await como(B, `select * from public.membros`)).linhas?.length === 0, 'outro usuário não vê a equipe');
ok((await como(B, `select public.salvar_dados($1, '{"clientes":[]}', 0)`, [E])).codigo === '42501', 'outro usuário não grava os dados');
ok(!!(await como(B, `insert into public.membros (escritorio_id, usuario_id, papel) values ($1, $2, 'admin')`, [E, B])).erro, 'ninguém se inclui direto na equipe');
ok(!!(await como(B, `insert into public.convites (escritorio_id, email, convidado_por) values ($1, 'bruno@exemplo.com', $2)`, [E, B])).erro, 'não membro não se convida');

// Convites.
ok(!(await como(A, `insert into public.convites (escritorio_id, email, convidado_por) values ($1, 'Bruno@Exemplo.com', $2)`, [E, A])).erro, 'admin convida por e-mail');
ok(!!(await como(A, `insert into public.convites (escritorio_id, email, convidado_por) values ($1, 'x@exemplo.com', $2)`, [E, B])).erro, 'convite não pode ser em nome de outro');
await como(A, `insert into public.convites (escritorio_id, email, convidado_por) values ($1, 'carla@exemplo.com', $2)`, [E, A]);
ok((await como(C, `select public.aceitar_convites('Carla') as n`)).linhas?.[0]?.n === 0, 'e-mail não verificado não aceita convite');
ok((await como(B, `select public.aceitar_convites('Bruno', '54321', 'SP') as n`)).linhas?.[0]?.n === 1, 'convidado verificado entra (e-mail sem diferenciar maiúsculas)');
ok((await como(B, `select papel from public.membros where usuario_id = $1`, [B])).linhas?.[0]?.papel === 'advogado', 'convidado entra como advogado');
ok((await como(B, `select count(*)::int as n from public.membros`)).linhas?.[0]?.n === 2, 'membro vê a equipe');

// Dados com controle de versão.
ok((await como(B, `select public.salvar_dados($1, '{"clientes":[1]}', 0) as v`, [E])).linhas?.[0]?.v === 1, 'membro grava os dados (versão 1)');
ok((await como(A, `select public.salvar_dados($1, '{"clientes":[2]}', 0)`, [E])).codigo === '40001', 'gravação com versão antiga dá conflito');
ok((await como(A, `select dados from public.dados_escritorio where escritorio_id = $1`, [E])).linhas?.[0]?.dados?.clientes?.[0] === 1, 'conflito não sobrescreve');
ok((await como(A, `select public.salvar_dados($1, '[1]', 1)`, [E])).codigo === '22023', 'dados precisam ser um objeto');

// Permissões de administrador.
ok((await como(B, `select * from public.convites`)).linhas?.length === 0, 'advogado não vê convites');
ok(!!(await como(B, `insert into public.config_escritorio (escritorio_id, integracao) values ($1, '{}')`, [E])).erro, 'advogado não altera integrações');
ok(!(await como(A, `insert into public.config_escritorio (escritorio_id, integracao, atualizado_por) values ($1, '{"google":{"webhookUrl":"https://n8n"}}', $2)`, [E, A])).erro, 'admin compartilha integrações');
ok((await como(B, `select integracao from public.config_escritorio`)).linhas?.length === 1, 'membro recebe as integrações');
ok((await como(B, `update public.escritorios set nome = 'Tomado' where id = $1 returning id`, [E])).linhas?.length === 0, 'advogado não renomeia o escritório');
ok((await como(B, `select public.definir_papel($1, $2, 'admin')`, [E, B])).codigo === '42501', 'advogado não se promove');
ok((await como(B, `select public.remover_membro($1, $2)`, [E, A])).codigo === '42501', 'advogado não remove o admin');
ok((await como(A, `select public.remover_membro($1, $2)`, [E, A])).codigo === '23514', 'último admin não sai');
ok((await como(A, `select public.definir_papel($1, $2, 'advogado')`, [E, A])).codigo === '23514', 'último admin não perde o papel');
ok(!(await como(A, `select public.remover_membro($1, $2)`, [E, B])).erro, 'admin remove advogado');
ok((await como(B, `select * from public.dados_escritorio`)).linhas?.length === 0, 'removido perde o acesso');

// RLS em todas as tabelas do schema public.
const semRls = await db.query(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
ok(semRls.rows.length === 0, `RLS ligado em todas as tabelas${semRls.rows.length ? `: faltam ${semRls.rows.map((r) => r.relname)}` : ''}`);

console.log(`\n${falhas} falha(s).`);
process.exit(falhas ? 1 : 0);
