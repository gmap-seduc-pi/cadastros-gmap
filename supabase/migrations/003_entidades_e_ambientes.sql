-- =====================================================================
-- 003 · Entidades (escolas, GREs, sede), dados escolares e ambientes
--
-- Regra para novos dados das entidades:
--   · dado estável e que vale para todas  → nova coluna em "entidades";
--   · dado só de escola                   → nova coluna em "dados_escola";
--   · dado que muda com o tempo ou repete → tabela própria com histórico
--     (como "matriculas_anuais" e, na 006, os responsáveis).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Entidades
-- ---------------------------------------------------------------------
create sequence if not exists public.entidades_seq;

create table if not exists public.entidades (
  id                text primary key default ('E' || lpad(nextval('public.entidades_seq')::text, 5, '0')),
  inep              text unique check (inep ~ '^\d{8}$'),
  nome              text not null check (length(trim(nome)) >= 3),
  tipologia_id      bigint not null references public.tipologias(id),
  municipio_id      bigint references public.municipios(id),  -- obrigatório na interface; pode faltar em dados antigos
  gre_id            bigint references public.gres(id),
  territorio_id     bigint references public.territorios(id),
  zona_id           bigint references public.zonas(id),
  bairro            text,
  endereco          text,
  plus_code         text,                 -- Google Plus Code
  cnpj              text check (cnpj is null or public.cnpj_valido(cnpj)),  -- só os 14 dígitos
  ativo             boolean not null default true,
  motivo_inativacao text,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  atualizado_por    uuid,
  constraint entidades_motivo_inativacao check (ativo or length(trim(coalesce(motivo_inativacao, ''))) >= 5)
);
create index if not exists entidades_municipio_idx on public.entidades (municipio_id);
create index if not exists entidades_gre_idx on public.entidades (gre_id);

-- CNPJ chega formatado da interface ou da planilha: guarda só os dígitos.
create or replace function public.limpar_cnpj()
returns trigger language plpgsql as $$
begin
  new.cnpj := nullif(regexp_replace(coalesce(new.cnpj, ''), '\D', '', 'g'), '');
  return new;
end $$;
drop trigger if exists limpar_cnpj on public.entidades;
create trigger limpar_cnpj before insert or update of cnpj on public.entidades
  for each row execute function public.limpar_cnpj();

select public.preparar_cadastro('entidades');

-- ---------------------------------------------------------------------
-- 2. Dados que só existem para escolas
-- ---------------------------------------------------------------------
create table if not exists public.dados_escola (
  entidade_id    text primary key references public.entidades(id),
  salas_aula     int check (salas_aula >= 0),  -- quantidade informada; a contagem real vem dos ambientes
  observacao     text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid
);

create or replace function public.exigir_escola()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.entidades e join public.tipologias t on t.id = e.tipologia_id
                  where e.id = new.entidade_id and t.eh_escola) then
    raise exception 'Este dado só pode ser registrado para escolas (a tipologia da entidade não é de escola).';
  end if;
  return new;
end $$;
drop trigger if exists exigir_escola on public.dados_escola;
create trigger exigir_escola before insert or update on public.dados_escola
  for each row execute function public.exigir_escola();

select public.preparar_cadastro('dados_escola', 'entidade_id', 'entidade_id');

-- ---------------------------------------------------------------------
-- 3. Matrículas por ano (uma linha por escola e ano, guarda o histórico)
-- ---------------------------------------------------------------------
create table if not exists public.matriculas_anuais (
  id             bigint generated always as identity primary key,
  entidade_id    text not null references public.entidades(id),
  ano            int not null check (ano between 2000 and 2100),
  quantidade     int not null check (quantidade >= 0),
  fonte          text not null default 'Informada'
                   check (fonte in ('Censo Escolar', 'Sistema de gestão escolar', 'Informada')),
  observacao     text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid,
  unique (entidade_id, ano)
);
drop trigger if exists exigir_escola on public.matriculas_anuais;
create trigger exigir_escola before insert or update on public.matriculas_anuais
  for each row execute function public.exigir_escola();

select public.preparar_cadastro('matriculas_anuais', 'id', 'entidade_id');

-- ---------------------------------------------------------------------
-- 4. Ambientes (futura localização física dos bens no sistema patrimonial)
-- ---------------------------------------------------------------------
create sequence if not exists public.ambientes_seq;

create table if not exists public.ambientes (
  id                text primary key default ('A' || lpad(nextval('public.ambientes_seq')::text, 6, '0')),
  entidade_id       text not null references public.entidades(id),
  tipo_id           bigint not null references public.tipos_ambiente(id),
  identificacao     text not null check (length(trim(identificacao)) >= 1),  -- "Sala 01", "Lab. 2"
  bloco             text,
  pavimento         text,
  capacidade        int check (capacidade >= 0),
  observacao        text,
  ativo             boolean not null default true,
  motivo_inativacao text,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  atualizado_por    uuid,
  constraint ambientes_motivo_inativacao check (ativo or length(trim(coalesce(motivo_inativacao, ''))) >= 5)
);
create index if not exists ambientes_entidade_idx on public.ambientes (entidade_id);
-- Na mesma entidade não pode haver dois ambientes ativos com a mesma identificação.
create unique index if not exists ambientes_identificacao_uq
  on public.ambientes (entidade_id, lower(trim(identificacao)), coalesce(lower(trim(bloco)), '')) where ativo;

select public.preparar_cadastro('ambientes', 'id', 'entidade_id');
