-- =====================================================================
-- 005 · Fornecedores, contratos e aditivos
-- A vigência e o valor atuais de um contrato são calculados a partir dos
-- aditivos (visão contratos_situacao), nunca digitados por cima do original.
-- Os fiscais e gestores de contrato ficam na migração 006 (servidores).
-- =====================================================================

create sequence if not exists public.fornecedores_seq;

create table if not exists public.fornecedores (
  id                text primary key default ('F' || lpad(nextval('public.fornecedores_seq')::text, 5, '0')),
  cnpj              text not null unique check (public.cnpj_valido(cnpj)),
  razao_social      text not null check (length(trim(razao_social)) >= 3),
  nome_fantasia     text,
  email             text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telefone          text,
  endereco          text,
  municipio         text,
  uf                char(2),
  observacao        text,
  ativo             boolean not null default true,
  motivo_inativacao text,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  atualizado_por    uuid,
  constraint fornecedores_motivo_inativacao check (ativo or length(trim(coalesce(motivo_inativacao, ''))) >= 5)
);
drop trigger if exists limpar_cnpj on public.fornecedores;
create trigger limpar_cnpj before insert or update of cnpj on public.fornecedores
  for each row execute function public.limpar_cnpj();

select public.preparar_cadastro('fornecedores');

create sequence if not exists public.contratos_seq;

create table if not exists public.contratos (
  id                text primary key default ('C' || lpad(nextval('public.contratos_seq')::text, 5, '0')),
  numero            text not null,                 -- 012/2025
  processo_sei      text,
  fornecedor_id     text not null references public.fornecedores(id),
  objeto            text not null check (length(trim(objeto)) >= 5),
  modalidade        text,                          -- pregão, adesão a ata, dispensa...
  valor_global      numeric(14,2) check (valor_global >= 0),
  data_assinatura   date,
  vigencia_inicio   date not null,
  vigencia_fim      date not null,
  observacao        text,
  ativo             boolean not null default true,
  motivo_inativacao text,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  atualizado_por    uuid,
  constraint contratos_vigencia check (vigencia_fim >= vigencia_inicio),
  constraint contratos_motivo_inativacao check (ativo or length(trim(coalesce(motivo_inativacao, ''))) >= 5)
);
create unique index if not exists contratos_numero_uq on public.contratos (lower(trim(numero)));
create index if not exists contratos_fornecedor_idx on public.contratos (fornecedor_id);

select public.preparar_cadastro('contratos', 'id', 'fornecedor_id');

create table if not exists public.contrato_aditivos (
  id               bigint generated always as identity primary key,
  contrato_id      text not null references public.contratos(id),
  numero           text not null,                  -- 1º Termo Aditivo
  tipo             text not null check (tipo in ('Prazo','Valor','Prazo e valor','Outro')),
  data_assinatura  date,
  nova_vigencia_fim date,
  valor_alteracao  numeric(14,2),                  -- acréscimo (positivo) ou supressão (negativo)
  processo_sei     text,
  descricao        text,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  atualizado_por   uuid,
  constraint aditivos_prazo check (tipo not in ('Prazo','Prazo e valor') or nova_vigencia_fim is not null),
  constraint aditivos_valor check (tipo not in ('Valor','Prazo e valor') or valor_alteracao is not null)
);
create unique index if not exists aditivos_numero_uq on public.contrato_aditivos (contrato_id, lower(trim(numero)));

select public.preparar_cadastro('contrato_aditivos', 'id', 'contrato_id');

-- Situação atual de cada contrato (respeita as regras de acesso de quem consulta)
create or replace view public.contratos_situacao with (security_invoker = true) as
select c.*,
       f.razao_social as fornecedor,
       greatest(c.vigencia_fim, coalesce(max(a.nova_vigencia_fim), c.vigencia_fim)) as vigencia_atual,
       c.valor_global + coalesce(sum(a.valor_alteracao), 0) as valor_atual,
       count(a.id) as aditivos,
       case
         when not c.ativo then 'Inativo'
         when current_date < c.vigencia_inicio then 'A iniciar'
         when current_date > greatest(c.vigencia_fim, coalesce(max(a.nova_vigencia_fim), c.vigencia_fim)) then 'Encerrado'
         else 'Vigente'
       end as situacao,
       greatest(c.vigencia_fim, coalesce(max(a.nova_vigencia_fim), c.vigencia_fim)) - current_date as dias_para_vencer
  from public.contratos c
  join public.fornecedores f on f.id = c.fornecedor_id
  left join public.contrato_aditivos a on a.contrato_id = c.id
 group by c.id, f.razao_social;

revoke all on public.contratos_situacao from anon;
grant select on public.contratos_situacao to authenticated;
