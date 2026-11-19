-- =====================================================================
-- 001 · Acesso, configuração e auditoria
-- Cadastros GMAP | SEDUC-PI
--
-- Perfis:
--   admin   gestores dos cadastros (Felipe e Thyago): editam tudo, aprovam
--           usuários e mudam configurações.
--   tecnico técnicos da GMAP: consultam tudo e cadastram ambientes escolares.
--
-- Regras gerais que valem para todas as tabelas de cadastro:
--   · ninguém apaga registros; registros são inativados;
--   · toda inclusão e alteração vai para public.auditoria, gravada pelo banco;
--   · o código de um registro (id) nunca muda depois de criado.
--
-- Execute uma única vez, em ordem, no SQL Editor do Supabase.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Perfis de usuário com aprovação
-- ---------------------------------------------------------------------
create table if not exists public.perfis (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  nome         text,
  perfil       text not null default 'tecnico' check (perfil in ('admin','tecnico')),
  situacao     text not null default 'pendente'
                 check (situacao in ('pendente','aprovado','recusado','bloqueado')),
  criado_em    timestamptz not null default now(),
  decidido_por uuid references auth.users(id) on delete set null,
  decidido_em  timestamptz
);

create table if not exists public.perfis_log (
  id            bigserial primary key,
  registrado_em timestamptz not null default now(),
  feito_por     uuid,
  usuario       uuid not null,
  acao          text not null,
  detalhe       text
);

-- Funções de permissão (usadas pelas regras de acesso de todas as tabelas)
create or replace function public.meu_perfil()
returns text language sql stable security definer set search_path = public as $$
  select perfil from public.perfis where user_id = auth.uid() and situacao = 'aprovado'
$$;

create or replace function public.eh_usuario()
returns boolean language sql stable security definer set search_path = public as $$
  select public.meu_perfil() is not null
$$;

create or replace function public.eh_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.meu_perfil() = 'admin', false)
$$;

-- Quem pode incluir e alterar em cada tabela. Para liberar uma tabela nova
-- aos técnicos, basta acrescentá-la na lista abaixo em uma nova migração.
create or replace function public.pode_editar(p_tabela text)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.meu_perfil()
           when 'admin'   then true
           when 'tecnico' then p_tabela in ('ambientes')
           else false
         end
$$;

grant execute on function public.meu_perfil(), public.eh_usuario(), public.eh_admin(), public.pode_editar(text)
  to authenticated;

alter table public.perfis enable row level security;
alter table public.perfis_log enable row level security;

drop policy if exists perfis_leitura on public.perfis;
create policy perfis_leitura on public.perfis for select to authenticated
  using (user_id = auth.uid() or public.eh_admin());

drop policy if exists perfis_log_leitura on public.perfis_log;
create policy perfis_log_leitura on public.perfis_log for select to authenticated
  using (public.eh_admin());

revoke all on public.perfis, public.perfis_log from anon, authenticated;
grant select on public.perfis, public.perfis_log to authenticated;

-- Ao criar conta pelo site, o usuário recebe um perfil PENDENTE.
create or replace function public.novo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if m->>'origem' is distinct from 'cadastros-gmap' then
    return new;  -- conta criada por outro caminho (painel do Supabase): sem perfil automático
  end if;
  insert into public.perfis (user_id, email, nome, perfil, situacao)
  values (new.id, new.email, nullif(trim(m->>'nome'), ''), 'tecnico', 'pendente')
  on conflict (user_id) do nothing;
  insert into public.perfis_log (feito_por, usuario, acao) values (new.id, new.id, 'solicitou acesso');
  return new;
end $$;

drop trigger if exists cadastros_ao_criar_usuario on auth.users;
create trigger cadastros_ao_criar_usuario after insert on auth.users
  for each row execute function public.novo_usuario();

create or replace function public.listar_usuarios()
returns table (user_id uuid, email text, nome text, perfil text, situacao text,
               criado_em timestamptz, decidido_em timestamptz, ultimo_acesso timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Acesso restrito aos gestores dos cadastros.'; end if;
  return query
    select p.user_id, p.email, p.nome, p.perfil, p.situacao, p.criado_em, p.decidido_em, u.last_sign_in_at
      from public.perfis p
      left join auth.users u on u.id = p.user_id
     order by case p.situacao when 'pendente' then 0 else 1 end, p.nome;
end $$;

create or replace function public.decidir_usuario(p_usuario uuid, p_acao text, p_perfil text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_situacao text;
begin
  if not public.eh_admin() then raise exception 'Acesso restrito aos gestores dos cadastros.'; end if;
  if p_usuario = auth.uid() then raise exception 'Você não pode alterar o próprio acesso.'; end if;
  if p_acao not in ('aprovar','recusar','bloquear','reativar','mudar perfil') then raise exception 'Ação inválida.'; end if;
  if p_acao in ('aprovar','mudar perfil') and coalesce(p_perfil, '') not in ('admin','tecnico') then
    raise exception 'Escolha o perfil.';
  end if;

  v_situacao := case p_acao when 'recusar' then 'recusado' when 'bloquear' then 'bloqueado' else 'aprovado' end;

  update public.perfis
     set situacao = v_situacao,
         perfil = coalesce(p_perfil, perfil),
         decidido_por = auth.uid(), decidido_em = now()
   where user_id = p_usuario;
  if not found then raise exception 'Usuário não encontrado.'; end if;

  insert into public.perfis_log (feito_por, usuario, acao, detalhe) values (auth.uid(), p_usuario, p_acao, p_perfil);
end $$;

revoke all on function public.listar_usuarios(), public.decidir_usuario(uuid, text, text) from public, anon;
grant execute on function public.listar_usuarios(), public.decidir_usuario(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Auditoria: quem mudou o quê, quando, antes e depois
-- ---------------------------------------------------------------------
create table if not exists public.auditoria (
  id           bigserial primary key,
  em           timestamptz not null default now(),
  tabela       text not null,
  registro     text not null,
  pai          text,            -- registro "dono" (ex.: a entidade de um ambiente), para o histórico completo
  operacao     text not null check (operacao in ('inclusao','alteracao','exclusao')),
  campos       text[],
  antes        jsonb,
  depois       jsonb,
  usuario_id   uuid,
  usuario_nome text,
  origem       text not null
);
create index if not exists auditoria_registro_idx on public.auditoria (tabela, registro, em desc);
create index if not exists auditoria_em_idx on public.auditoria (em desc);
create index if not exists auditoria_pai_idx on public.auditoria (pai, em desc) where pai is not null;

alter table public.auditoria enable row level security;
drop policy if exists auditoria_leitura on public.auditoria;
create policy auditoria_leitura on public.auditoria for select to authenticated using (public.eh_usuario());
revoke all on public.auditoria from anon, authenticated;
grant select on public.auditoria to authenticated;

-- Antes de gravar: carimba quem e quando, e impede mudar o código (TG_ARGV[0] = coluna-chave).
create or replace function public.carimbar()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (to_jsonb(new) ->> tg_argv[0]) is distinct from (to_jsonb(old) ->> tg_argv[0]) then
    raise exception 'O código de um registro não pode ser alterado.';
  end if;
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end $$;

-- Depois de gravar: registra na auditoria só os campos que mudaram.
create or replace function public.auditar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_antes  jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_depois jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  v_campos text[];
  v_ignorar text[] := array['atualizado_em','atualizado_por','criado_em'];
  v_registro text := coalesce(to_jsonb(new), to_jsonb(old)) ->> tg_argv[0];
  v_pai      text := case when tg_nargs > 1 then coalesce(to_jsonb(new), to_jsonb(old)) ->> tg_argv[1] end;
begin
  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_campos
      from jsonb_object_keys(v_depois) k
     where k <> all (v_ignorar) and (v_antes -> k) is distinct from (v_depois -> k);
    if v_campos is null then return null; end if;  -- nada mudou de fato
    select jsonb_object_agg(k, v_antes -> k) into v_antes from unnest(v_campos) k;
    select jsonb_object_agg(k, v_depois -> k) into v_depois from unnest(v_campos) k;
  end if;

  insert into public.auditoria (tabela, registro, pai, operacao, campos, antes, depois, usuario_id, usuario_nome, origem)
  values (tg_table_name,
          v_registro, v_pai,
          case tg_op when 'INSERT' then 'inclusao' when 'UPDATE' then 'alteracao' else 'exclusao' end,
          v_campos, v_antes, v_depois, auth.uid(),
          (select coalesce(nome, email) from public.perfis where user_id = auth.uid()),
          coalesce(nullif(current_setting('app.origem', true), ''),
                   case when auth.uid() is null then 'sistema' else 'interface' end));
  return null;
end $$;

-- Aplica carimbo, auditoria e regras de acesso padrão a uma tabela de cadastro.
-- Leitura: qualquer usuário aprovado. Inclusão e alteração: conforme pode_editar().
-- Exclusão: ninguém (nem a interface); registros são inativados.
create or replace function public.preparar_cadastro(p_tabela text, p_chave text default 'id', p_pai text default null)
returns void language plpgsql as $$
begin
  execute format('drop trigger if exists carimbar on public.%I', p_tabela);
  execute format('create trigger carimbar before insert or update on public.%I for each row execute function public.carimbar(%L)', p_tabela, p_chave);
  execute format('drop trigger if exists auditar on public.%I', p_tabela);
  execute format('create trigger auditar after insert or update or delete on public.%I for each row execute function public.auditar(%s)', p_tabela,
                 quote_literal(p_chave) || coalesce(', ' || quote_literal(p_pai), ''));

  execute format('alter table public.%I enable row level security', p_tabela);
  execute format('drop policy if exists leitura on public.%I', p_tabela);
  execute format('create policy leitura on public.%I for select to authenticated using (public.eh_usuario())', p_tabela);
  execute format('drop policy if exists inclusao on public.%I', p_tabela);
  execute format('create policy inclusao on public.%I for insert to authenticated with check (public.pode_editar(%L))', p_tabela, p_tabela);
  execute format('drop policy if exists alteracao on public.%I', p_tabela);
  execute format('create policy alteracao on public.%I for update to authenticated using (public.pode_editar(%L)) with check (public.pode_editar(%L))', p_tabela, p_tabela, p_tabela);

  execute format('revoke all on public.%I from anon, authenticated', p_tabela);
  execute format('grant select, insert, update on public.%I to authenticated', p_tabela);
end $$;
revoke all on function public.preparar_cadastro(text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Configuração do sistema (uma linha só)
-- ---------------------------------------------------------------------
create table if not exists public.configuracao (
  id                          int primary key default 1 check (id = 1),
  modulo_servidores_ativo     boolean not null default false,
  modulo_servidores_autorizacao text,   -- referência da autorização da gerência (processo SEI, memorando)
  carga_inicial_concluida     boolean not null default false,
  atualizado_em               timestamptz not null default now(),
  atualizado_por              uuid
);
insert into public.configuracao (id) values (1) on conflict do nothing;

drop trigger if exists carimbar on public.configuracao;
create trigger carimbar before update on public.configuracao for each row execute function public.carimbar('id');
drop trigger if exists auditar on public.configuracao;
create trigger auditar after update on public.configuracao for each row execute function public.auditar('id');

alter table public.configuracao enable row level security;
drop policy if exists leitura on public.configuracao;
create policy leitura on public.configuracao for select to authenticated using (public.eh_usuario());
revoke all on public.configuracao from anon, authenticated;
grant select on public.configuracao to authenticated;

-- Ativar ou desativar o módulo de servidores (só gestores, com a referência da autorização).
create or replace function public.definir_modulo_servidores(p_ativo boolean, p_autorizacao text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Acesso restrito aos gestores dos cadastros.'; end if;
  if p_ativo and length(trim(coalesce(p_autorizacao, ''))) < 5 then
    raise exception 'Informe a referência da autorização da gerência (processo SEI, memorando ou e-mail).';
  end if;
  update public.configuracao
     set modulo_servidores_ativo = p_ativo,
         modulo_servidores_autorizacao = case when p_ativo then trim(p_autorizacao)
                                              else coalesce(nullif(trim(p_autorizacao), ''), modulo_servidores_autorizacao) end
   where id = 1;
end $$;

-- Encerrar a carga inicial: a partir daí a planilha deixa de ser fonte e vira só espelho.
create or replace function public.concluir_carga_inicial()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Acesso restrito aos gestores dos cadastros.'; end if;
  update public.configuracao set carga_inicial_concluida = true where id = 1;
end $$;

revoke all on function public.definir_modulo_servidores(boolean, text), public.concluir_carga_inicial() from public, anon;
grant execute on function public.definir_modulo_servidores(boolean, text), public.concluir_carga_inicial() to authenticated;

-- ---------------------------------------------------------------------
-- 4. Validação de CNPJ (dígitos verificadores). Guarda-se só os 14 dígitos.
-- ---------------------------------------------------------------------
create or replace function public.cnpj_valido(p text)
returns boolean language plpgsql immutable as $$
declare
  d int[]; s int; r int; i int;
  p1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  p2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
begin
  if p is null or p !~ '^\d{14}$' or p ~ '^(\d)\1{13}$' then return false; end if;
  select array_agg(substr(p, g, 1)::int order by g) into d from generate_series(1, 14) g;
  s := 0; for i in 1..12 loop s := s + d[i] * p1[i]; end loop;
  r := s % 11; if (case when r < 2 then 0 else 11 - r end) <> d[13] then return false; end if;
  s := 0; for i in 1..13 loop s := s + d[i] * p2[i]; end loop;
  r := s % 11; return (case when r < 2 then 0 else 11 - r end) = d[14];
end $$;

create or replace function public.cnpj_formatado(p text)
returns text language sql immutable as $$
  select case when p ~ '^\d{14}$'
              then substr(p,1,2)||'.'||substr(p,3,3)||'.'||substr(p,6,3)||'/'||substr(p,9,4)||'-'||substr(p,13,2)
              else p end
$$;
