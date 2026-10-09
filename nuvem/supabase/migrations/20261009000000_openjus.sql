-- OpenJus: escritórios com vários advogados e sincronização dos dados (Supabase/Postgres).
--
-- Regras de segurança (ver SEGURANCA.md):
-- * RLS ligado em TODAS as tabelas; nada é acessível sem login (papel anon não tem acesso).
-- * Login só com Google ou Microsoft (o Supabase não guarda senha). Convites só são
--   aceitos por contas com e-mail verificado (auth.users.email_confirmed_at).
-- * Escritas sensíveis passam por funções SECURITY DEFINER com search_path vazio,
--   que conferem quem chama (auth.uid()) e o papel no escritório.

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create type public.papel_membro as enum ('admin', 'advogado', 'assistente');

create table public.escritorios (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 1 and 120),
  criado_por uuid not null references auth.users (id),
  criado_em timestamptz not null default now()
);

create table public.membros (
  escritorio_id uuid not null references public.escritorios (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  papel public.papel_membro not null default 'advogado',
  nome text not null default '' check (char_length(nome) <= 120),
  email text not null default '' check (char_length(email) <= 254),
  oab text not null default '' check (oab ~ '^[0-9]{0,7}$'),
  uf_oab text not null default '' check (uf_oab ~ '^([A-Z]{2})?$'),
  entrou_em timestamptz not null default now(),
  primary key (escritorio_id, usuario_id)
);
create index membros_usuario on public.membros (usuario_id);

create table public.convites (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios (id) on delete cascade,
  email text not null check (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  papel public.papel_membro not null default 'advogado',
  convidado_por uuid not null references auth.users (id),
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '14 days',
  unique (escritorio_id, email)
);
create index convites_email on public.convites (lower(email));

-- Dados do escritório (clientes, processos, agenda, financeiro…) como um documento
-- versionado: o app mescla as alterações e grava com controle de versão.
create table public.dados_escritorio (
  escritorio_id uuid primary key references public.escritorios (id) on delete cascade,
  dados jsonb not null default '{}'::jsonb check (pg_column_size(dados) <= 20 * 1024 * 1024),
  versao bigint not null default 0,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users (id)
);

-- Integrações compartilhadas (webhooks do n8n e pastas do Drive/OneDrive): o
-- administrador configura uma vez e cada advogado recebe ao entrar.
create table public.config_escritorio (
  escritorio_id uuid primary key references public.escritorios (id) on delete cascade,
  integracao jsonb not null default '{}'::jsonb check (pg_column_size(integracao) <= 64 * 1024),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users (id)
);

alter table public.escritorios enable row level security;
alter table public.membros enable row level security;
alter table public.convites enable row level security;
alter table public.dados_escritorio enable row level security;
alter table public.config_escritorio enable row level security;

-- ---------------------------------------------------------------------------
-- Funções auxiliares (usadas nas políticas)
-- ---------------------------------------------------------------------------

create function public.eh_membro(p_escritorio uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membros m
    where m.escritorio_id = p_escritorio and m.usuario_id = (select auth.uid())
  );
$$;

create function public.eh_admin(p_escritorio uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membros m
    where m.escritorio_id = p_escritorio and m.usuario_id = (select auth.uid()) and m.papel = 'admin'
  );
$$;

/** E-mail do usuário logado, só se verificado pelo provedor (Google/Microsoft). */
create function public.email_verificado() returns text
language sql stable security definer set search_path = '' as $$
  select lower(u.email) from auth.users u
  where u.id = (select auth.uid()) and u.email_confirmed_at is not null;
$$;

-- ---------------------------------------------------------------------------
-- Políticas (RLS)
-- ---------------------------------------------------------------------------

create policy "membros veem o escritório" on public.escritorios
  for select to authenticated using (public.eh_membro(id));
create policy "admin renomeia o escritório" on public.escritorios
  for update to authenticated using (public.eh_admin(id)) with check (public.eh_admin(id));

create policy "membros veem a equipe" on public.membros
  for select to authenticated using (public.eh_membro(escritorio_id));

create policy "admin vê convites" on public.convites
  for select to authenticated using (public.eh_admin(escritorio_id));
create policy "admin convida" on public.convites
  for insert to authenticated
  with check (public.eh_admin(escritorio_id) and convidado_por = (select auth.uid()));
create policy "admin cancela convites" on public.convites
  for delete to authenticated using (public.eh_admin(escritorio_id));

create policy "membros leem os dados" on public.dados_escritorio
  for select to authenticated using (public.eh_membro(escritorio_id));

create policy "membros leem as integrações" on public.config_escritorio
  for select to authenticated using (public.eh_membro(escritorio_id));
create policy "admin cria integrações" on public.config_escritorio
  for insert to authenticated with check (public.eh_admin(escritorio_id));
create policy "admin altera integrações" on public.config_escritorio
  for update to authenticated using (public.eh_admin(escritorio_id)) with check (public.eh_admin(escritorio_id));

-- Sem acesso para quem não fez login; o restante é liberado só pelas políticas acima.
revoke all on public.escritorios, public.membros, public.convites, public.dados_escritorio, public.config_escritorio from anon;
revoke all on public.escritorios, public.membros, public.convites, public.dados_escritorio, public.config_escritorio from authenticated;
grant select, update (nome) on public.escritorios to authenticated;
grant select on public.membros to authenticated;
grant select, insert (escritorio_id, email, papel, convidado_por), delete on public.convites to authenticated;
grant select on public.dados_escritorio to authenticated;
grant select, insert (escritorio_id, integracao, atualizado_por), update (integracao, atualizado_em, atualizado_por) on public.config_escritorio to authenticated;

-- ---------------------------------------------------------------------------
-- Operações (RPC)
-- ---------------------------------------------------------------------------

create function public.criar_escritorio(p_nome text, p_nome_membro text default '', p_oab text default '', p_uf_oab text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := auth.uid();
  v_email text := public.email_verificado();
  v_id uuid;
begin
  if v_usuario is null or v_email is null then
    raise exception 'Entre com uma conta de e-mail verificado.' using errcode = '42501';
  end if;
  if (select count(*) from public.membros where usuario_id = v_usuario and papel = 'admin') >= 5 then
    raise exception 'Limite de escritórios por conta atingido.' using errcode = '54000';
  end if;
  insert into public.escritorios (nome, criado_por) values (btrim(p_nome), v_usuario) returning id into v_id;
  insert into public.membros (escritorio_id, usuario_id, papel, nome, email, oab, uf_oab)
    values (v_id, v_usuario, 'admin', left(btrim(p_nome_membro), 120), v_email, p_oab, upper(p_uf_oab));
  insert into public.dados_escritorio (escritorio_id, atualizado_por) values (v_id, v_usuario);
  return v_id;
end;
$$;

/** Entra nos escritórios para os quais o e-mail (verificado) foi convidado. */
create function public.aceitar_convites(p_nome text default '', p_oab text default '', p_uf_oab text default '')
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := auth.uid();
  v_email text := public.email_verificado();
  v_total integer := 0;
  c record;
begin
  if v_usuario is null or v_email is null then
    return 0;
  end if;
  for c in
    delete from public.convites where lower(email) = v_email and expira_em > now() returning escritorio_id, papel
  loop
    insert into public.membros (escritorio_id, usuario_id, papel, nome, email, oab, uf_oab)
      values (c.escritorio_id, v_usuario, c.papel, left(btrim(p_nome), 120), v_email, p_oab, upper(p_uf_oab))
      on conflict (escritorio_id, usuario_id) do nothing;
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$$;

create function public.atualizar_meu_cadastro(p_escritorio uuid, p_nome text, p_oab text, p_uf_oab text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.membros
    set nome = left(btrim(p_nome), 120), oab = p_oab, uf_oab = upper(p_uf_oab)
    where escritorio_id = p_escritorio and usuario_id = auth.uid();
  if not found then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
end;
$$;

/** Grava os dados se ninguém gravou depois da versão lida; senão, o app mescla e tenta de novo. */
create function public.salvar_dados(p_escritorio uuid, p_dados jsonb, p_versao_base bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_versao bigint;
begin
  if not public.eh_membro(p_escritorio) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_dados) <> 'object' then
    raise exception 'Dados inválidos.' using errcode = '22023';
  end if;
  update public.dados_escritorio
    set dados = p_dados, versao = versao + 1, atualizado_em = now(), atualizado_por = auth.uid()
    where escritorio_id = p_escritorio and versao = p_versao_base
    returning versao into v_versao;
  if v_versao is null then
    raise exception 'conflito' using errcode = '40001';
  end if;
  return v_versao;
end;
$$;

/** Admin muda o papel de alguém ou remove; qualquer um pode sair. Sempre fica ao menos um admin. */
create function public.remover_membro(p_escritorio uuid, p_usuario uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_usuario <> auth.uid() and not public.eh_admin(p_escritorio) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if exists (select 1 from public.membros where escritorio_id = p_escritorio and usuario_id = p_usuario and papel = 'admin')
     and (select count(*) from public.membros where escritorio_id = p_escritorio and papel = 'admin') = 1 then
    raise exception 'O escritório precisa de pelo menos um administrador.' using errcode = '23514';
  end if;
  delete from public.membros where escritorio_id = p_escritorio and usuario_id = p_usuario;
end;
$$;

create function public.definir_papel(p_escritorio uuid, p_usuario uuid, p_papel public.papel_membro)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_admin(p_escritorio) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p_papel <> 'admin'
     and exists (select 1 from public.membros where escritorio_id = p_escritorio and usuario_id = p_usuario and papel = 'admin')
     and (select count(*) from public.membros where escritorio_id = p_escritorio and papel = 'admin') = 1 then
    raise exception 'O escritório precisa de pelo menos um administrador.' using errcode = '23514';
  end if;
  update public.membros set papel = p_papel where escritorio_id = p_escritorio and usuario_id = p_usuario;
end;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.eh_membro(uuid), public.eh_admin(uuid), public.email_verificado(),
  public.criar_escritorio(text, text, text, text), public.aceitar_convites(text, text, text),
  public.atualizar_meu_cadastro(uuid, text, text, text), public.salvar_dados(uuid, jsonb, bigint),
  public.remover_membro(uuid, uuid), public.definir_papel(uuid, uuid, public.papel_membro)
to authenticated;
