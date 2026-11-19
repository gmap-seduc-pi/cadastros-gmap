-- =====================================================================
-- 006 · Servidores, responsáveis pelas entidades e fiscais de contrato
--
-- Dados pessoais (LGPD): guarda-se só nome, cargo e telefone, conforme
-- decidido pela GMAP. Nada de CPF, endereço ou e-mail pessoal.
--
-- O módulo nasce DESATIVADO. Enquanto a gerência não autorizar (ativação
-- feita por um gestor na tela Configurações, com a referência da
-- autorização), o banco recusa qualquer inclusão ou alteração aqui.
--
-- Responsável e fiscal não são sobrescritos quando mudam: o vínculo antigo
-- é encerrado (data fim) e um novo é aberto. Assim sempre se sabe quem
-- respondia por uma escola ou contrato em qualquer data.
-- =====================================================================

create or replace function public.exigir_modulo_servidores()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not (select modulo_servidores_ativo from public.configuracao where id = 1) then
    raise exception 'O módulo de servidores aguarda a autorização da gerência. Um gestor pode ativá-lo em Configurações.';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 1. Servidores
-- ---------------------------------------------------------------------
create sequence if not exists public.servidores_seq;

create table if not exists public.servidores (
  id                text primary key default ('S' || lpad(nextval('public.servidores_seq')::text, 5, '0')),
  nome              text not null check (length(trim(nome)) >= 5),
  cargo             text,
  telefone          text check (telefone is null or regexp_replace(telefone, '\D', '', 'g') ~ '^\d{10,11}$'),
  ativo             boolean not null default true,
  motivo_inativacao text,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  atualizado_por    uuid,
  constraint servidores_motivo_inativacao check (ativo or length(trim(coalesce(motivo_inativacao, ''))) >= 5)
);
drop trigger if exists exigir_modulo on public.servidores;
create trigger exigir_modulo before insert or update on public.servidores
  for each row execute function public.exigir_modulo_servidores();

select public.preparar_cadastro('servidores');

-- ---------------------------------------------------------------------
-- 2. Responsáveis pelas entidades (com período)
-- ---------------------------------------------------------------------
create table if not exists public.entidade_responsaveis (
  id             bigint generated always as identity primary key,
  entidade_id    text not null references public.entidades(id),
  servidor_id    text not null references public.servidores(id),
  funcao_id      bigint not null references public.funcoes_responsavel(id),
  inicio         date not null default current_date,
  fim            date,
  observacao     text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid,
  constraint responsaveis_periodo check (fim is null or fim >= inicio)
);
-- Só um responsável vigente por função em cada entidade.
create unique index if not exists responsaveis_vigente_uq
  on public.entidade_responsaveis (entidade_id, funcao_id) where fim is null;
create index if not exists responsaveis_servidor_idx on public.entidade_responsaveis (servidor_id);

drop trigger if exists exigir_modulo on public.entidade_responsaveis;
create trigger exigir_modulo before insert or update on public.entidade_responsaveis
  for each row execute function public.exigir_modulo_servidores();

select public.preparar_cadastro('entidade_responsaveis', 'id', 'entidade_id');

-- Troca de responsável em um passo: encerra o vigente e abre o novo.
create or replace function public.definir_responsavel(p_entidade text, p_funcao bigint, p_servidor text,
                                                      p_inicio date default current_date, p_observacao text default null)
returns bigint language plpgsql security invoker set search_path = public as $$
declare
  v_id bigint;
begin
  if not public.pode_editar('entidade_responsaveis') then raise exception 'Sem permissão para alterar responsáveis.'; end if;
  if p_inicio is null then raise exception 'Informe a data de início.'; end if;
  update public.entidade_responsaveis
     set fim = greatest(inicio, p_inicio - 1)
   where entidade_id = p_entidade and funcao_id = p_funcao and fim is null;
  insert into public.entidade_responsaveis (entidade_id, servidor_id, funcao_id, inicio, observacao)
  values (p_entidade, p_servidor, p_funcao, p_inicio, nullif(trim(p_observacao), ''))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.definir_responsavel(text, bigint, text, date, text) from public, anon;
grant execute on function public.definir_responsavel(text, bigint, text, date, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Gestores e fiscais de contrato (com período)
-- ---------------------------------------------------------------------
create table if not exists public.contrato_fiscais (
  id             bigint generated always as identity primary key,
  contrato_id    text not null references public.contratos(id),
  servidor_id    text not null references public.servidores(id),
  papel          text not null check (papel in ('Gestor','Fiscal técnico','Fiscal administrativo',
                                                'Fiscal titular','Fiscal suplente')),
  portaria       text,                            -- ato de designação
  inicio         date not null default current_date,
  fim            date,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid,
  constraint fiscais_periodo check (fim is null or fim >= inicio)
);
create unique index if not exists fiscais_vigente_uq
  on public.contrato_fiscais (contrato_id, servidor_id, papel) where fim is null;

drop trigger if exists exigir_modulo on public.contrato_fiscais;
create trigger exigir_modulo before insert or update on public.contrato_fiscais
  for each row execute function public.exigir_modulo_servidores();

select public.preparar_cadastro('contrato_fiscais', 'id', 'contrato_id');
