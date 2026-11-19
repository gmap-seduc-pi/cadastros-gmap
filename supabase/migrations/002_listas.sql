-- =====================================================================
-- 002 · Listas controladas
-- Valores que se repetem em vários cadastros (GRE, município, tipologia...)
-- ficam em tabelas próprias. Assim não existem "01ª - PARNAIBA" e
-- "01ª - PARNAÍBA" ao mesmo tempo, e renomear um valor corrige todos os
-- registros de uma vez. Valores em uso não são apagados: são inativados.
-- =====================================================================

create table if not exists public.gres (
  id             bigint generated always as identity primary key,
  codigo         text not null,                 -- 01ª, 02ª...
  nome           text not null,                 -- PARNAÍBA
  rotulo         text generated always as (codigo || ' - ' || nome) stored,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid
);
create unique index if not exists gres_codigo_uq on public.gres (lower(codigo));

create table if not exists public.municipios (
  id             bigint generated always as identity primary key,
  nome           text not null,
  uf             char(2) not null default 'PI',
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid
);
create unique index if not exists municipios_nome_uq on public.municipios (lower(nome), uf);

create table if not exists public.tipologias (
  id             bigint generated always as identity primary key,
  nome           text not null,
  eh_escola      boolean not null default true,  -- desmarque para GRE, sede e outras unidades que não são escola
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid
);
create unique index if not exists tipologias_nome_uq on public.tipologias (lower(nome));

create table if not exists public.territorios (
  id             bigint generated always as identity primary key,
  nome           text not null,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid
);
create unique index if not exists territorios_nome_uq on public.territorios (lower(nome));

create table if not exists public.zonas (
  id             bigint generated always as identity primary key,
  nome           text not null,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid
);
create unique index if not exists zonas_nome_uq on public.zonas (lower(nome));

create table if not exists public.tipos_ambiente (
  id             bigint generated always as identity primary key,
  nome           text not null,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid
);
create unique index if not exists tipos_ambiente_nome_uq on public.tipos_ambiente (lower(nome));

create table if not exists public.funcoes_responsavel (
  id             bigint generated always as identity primary key,
  nome           text not null,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid
);
create unique index if not exists funcoes_responsavel_nome_uq on public.funcoes_responsavel (lower(nome));

create table if not exists public.classes_material (
  id             bigint generated always as identity primary key,
  nome           text not null,
  prefixo        text not null check (prefixo ~ '^[A-Z]{3}$'),  -- MOB, INF, ELE... usado no código do material
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid
);
create unique index if not exists classes_material_nome_uq on public.classes_material (lower(nome));
create unique index if not exists classes_material_prefixo_uq on public.classes_material (prefixo);

-- O prefixo é a base dos códigos já emitidos: não pode mudar depois de criado.
create or replace function public.prefixo_imutavel()
returns trigger language plpgsql as $$
begin
  if new.prefixo is distinct from old.prefixo then
    raise exception 'O prefixo de uma classe não pode ser alterado (ele faz parte dos códigos já emitidos).';
  end if;
  return new;
end $$;
drop trigger if exists prefixo_imutavel on public.classes_material;
create trigger prefixo_imutavel before update on public.classes_material
  for each row execute function public.prefixo_imutavel();

select public.preparar_cadastro(t)
  from unnest(array['gres','municipios','tipologias','territorios','zonas',
                    'tipos_ambiente','funcoes_responsavel','classes_material']) t;

-- Valores iniciais (podem ser editados na tela Listas)
insert into public.tipos_ambiente (nome) values
  ('Sala de aula'), ('Laboratório de informática'), ('Laboratório de ciências'), ('Biblioteca'),
  ('Sala de leitura'), ('Sala de recursos multifuncionais (AEE)'), ('Sala dos professores'),
  ('Diretoria'), ('Secretaria'), ('Coordenação'), ('Cozinha'), ('Refeitório'), ('Despensa'),
  ('Almoxarifado'), ('Quadra de esportes'), ('Auditório'), ('Banheiro'), ('Pátio'), ('Outro')
on conflict do nothing;

insert into public.funcoes_responsavel (nome) values
  ('Diretor(a)'), ('Vice-diretor(a)'), ('Coordenador(a) pedagógico(a)'), ('Secretário(a) escolar'),
  ('Responsável pelo patrimônio'), ('Gerente regional'), ('Chefe de setor')
on conflict do nothing;
