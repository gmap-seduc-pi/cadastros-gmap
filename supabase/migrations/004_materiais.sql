-- =====================================================================
-- 004 · Catálogo de materiais
-- Código no formato PREFIXO-NNNN (MOB-0001), gerado pelo banco a partir do
-- prefixo da classe. Códigos já emitidos na planilha são mantidos.
-- qtd_tombos vazio significa "variável" (o "N" da planilha, usado em kits).
-- =====================================================================

create table if not exists public.materiais (
  codigo            text primary key check (codigo ~ '^[A-Z]{3}-\d{4,}$'),
  descricao         text not null check (length(trim(descricao)) >= 3),
  classe_id         bigint not null references public.classes_material(id),
  tipo_controle     text not null check (tipo_controle in ('Singular','Composto','Kit','Quantitativo')),
  qtd_tombos        int check (qtd_tombos >= 0),
  observacao        text,
  ativo             boolean not null default true,
  motivo_inativacao text,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  atualizado_por    uuid,
  constraint materiais_motivo_inativacao check (ativo or length(trim(coalesce(motivo_inativacao, ''))) >= 5),
  constraint materiais_tombos_composto check (tipo_controle <> 'Composto' or qtd_tombos is null or qtd_tombos >= 2)
);
create unique index if not exists materiais_descricao_uq on public.materiais (lower(trim(descricao)));
create index if not exists materiais_classe_idx on public.materiais (classe_id);

-- Gera o próximo código da classe quando a inclusão vem sem código.
create or replace function public.gerar_codigo_material()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_prefixo text;
  v_prox int;
begin
  if new.codigo is not null and trim(new.codigo) <> '' then
    new.codigo := upper(trim(new.codigo));
    return new;
  end if;
  select prefixo into v_prefixo from public.classes_material where id = new.classe_id;
  if v_prefixo is null then raise exception 'Classe de material não encontrada.'; end if;
  perform pg_advisory_xact_lock(hashtext('materiais:' || v_prefixo));
  select coalesce(max(substring(codigo from '^[A-Z]{3}-(\d+)$')::int), 0) + 1 into v_prox
    from public.materiais where codigo like v_prefixo || '-%';
  new.codigo := v_prefixo || '-' || lpad(v_prox::text, 4, '0');
  return new;
end $$;
drop trigger if exists gerar_codigo on public.materiais;
create trigger gerar_codigo before insert on public.materiais
  for each row execute function public.gerar_codigo_material();

select public.preparar_cadastro('materiais', 'codigo');
