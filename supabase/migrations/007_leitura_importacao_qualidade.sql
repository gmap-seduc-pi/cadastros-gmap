-- =====================================================================
-- 007 · Leitura pelos outros sistemas, carga inicial da planilha e
--       indicadores de qualidade dos cadastros
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Visões de leitura (nomes já resolvidos)
--    Usadas pela interface e pelos sistemas que consomem a base.
--    security_invoker: quem consulta só vê o que as regras de acesso permitem.
-- ---------------------------------------------------------------------
create or replace view public.v_entidades with (security_invoker = true) as
select e.id, e.inep, e.nome,
       e.nome || coalesce(' - ' || e.inep, '') || coalesce(' - ' || m.nome, '') as nome_inep,
       e.tipologia_id, t.nome as tipologia, t.eh_escola,
       e.municipio_id, m.nome as municipio,
       e.gre_id, g.codigo as gre, g.rotulo as gre_rotulo,
       e.territorio_id, tr.nome as territorio,
       e.zona_id, z.nome as zona,
       e.bairro, e.endereco, e.plus_code,
       e.cnpj, public.cnpj_formatado(e.cnpj) as cnpj_formatado,
       e.ativo, e.motivo_inativacao, e.criado_em, e.atualizado_em
  from public.entidades e
  join public.tipologias t on t.id = e.tipologia_id
  left join public.municipios m on m.id = e.municipio_id
  left join public.gres g on g.id = e.gre_id
  left join public.territorios tr on tr.id = e.territorio_id
  left join public.zonas z on z.id = e.zona_id;

create or replace view public.v_materiais with (security_invoker = true) as
select mt.codigo, mt.descricao, mt.classe_id, c.nome as classe, c.prefixo,
       mt.tipo_controle, mt.qtd_tombos, mt.observacao, mt.ativo, mt.motivo_inativacao,
       mt.criado_em, mt.atualizado_em
  from public.materiais mt
  join public.classes_material c on c.id = mt.classe_id;

create or replace view public.v_ambientes with (security_invoker = true) as
select a.id, a.entidade_id, e.nome as entidade, e.inep, m.nome as municipio, g.codigo as gre,
       a.tipo_id, ta.nome as tipo, a.identificacao, a.bloco, a.pavimento, a.capacidade,
       a.observacao, a.ativo, a.motivo_inativacao, a.criado_em, a.atualizado_em
  from public.ambientes a
  join public.entidades e on e.id = a.entidade_id
  join public.tipos_ambiente ta on ta.id = a.tipo_id
  left join public.municipios m on m.id = e.municipio_id
  left join public.gres g on g.id = e.gre_id;

create or replace view public.v_responsaveis with (security_invoker = true) as
select r.id, r.entidade_id, e.nome as entidade, r.servidor_id, s.nome as servidor, s.cargo, s.telefone,
       r.funcao_id, f.nome as funcao, r.inicio, r.fim, (r.fim is null) as vigente, r.observacao
  from public.entidade_responsaveis r
  join public.entidades e on e.id = r.entidade_id
  join public.servidores s on s.id = r.servidor_id
  join public.funcoes_responsavel f on f.id = r.funcao_id;

create or replace view public.v_fiscais with (security_invoker = true) as
select cf.id, cf.contrato_id, c.numero as contrato, cf.servidor_id, s.nome as servidor, s.cargo, s.telefone,
       cf.papel, cf.portaria, cf.inicio, cf.fim, (cf.fim is null) as vigente
  from public.contrato_fiscais cf
  join public.contratos c on c.id = cf.contrato_id
  join public.servidores s on s.id = cf.servidor_id;

revoke all on public.v_entidades, public.v_materiais, public.v_ambientes, public.v_responsaveis, public.v_fiscais from anon;
grant select on public.v_entidades, public.v_materiais, public.v_ambientes, public.v_responsaveis, public.v_fiscais
  to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Espelho da planilha BASE - CADASTROS
--    Mesmos cabeçalhos e mesma ordem de colunas da planilha, para que o
--    Painel de O.S. e o Kanban continuem funcionando sem mudança.
--    Só registros ativos e NENHUM dado pessoal (a aba é publicada na web).
--    Lidas pelo Apps Script com a chave secreta (service_role).
-- ---------------------------------------------------------------------
create or replace view public.espelho_entidades as
select coalesce(e.inep, '')                                   as "INEP",
       e.nome                                                 as "NOME ENTIDADE",
       e.nome_inep                                            as "NOME INEP",
       coalesce(e.municipio, '')                              as "MUNICIPIO",
       coalesce(e.gre_rotulo, '')                             as "GRE/CIDADE",
       coalesce(e.gre, '')                                    as "GRE",
       coalesce(e.endereco, '')                               as "ENDEREÇOS",
       coalesce(e.plus_code, '')                              as "GOOGLE PLUS CODE",
       e.tipologia                                            as "TIPOLOGIA",
       coalesce(e.territorio, '')                             as "TERRITÓRIO",
       coalesce(e.bairro, '')                                 as "BAIRROS",
       coalesce(e.cnpj_formatado, '')                         as "CNPJ",
       coalesce(e.zona, '')                                   as "ZONA",
       e.id                                                   as "ID SISTEMA"
  from public.v_entidades e
 where e.ativo
 order by e.id;

create or replace view public.espelho_materiais as
select m.codigo                                     as "Código",
       m.descricao                                  as "FKMaterial: DescricaoMaterial",
       m.classe                                     as "Classe",
       m.tipo_controle                              as "Tipo",
       coalesce(m.qtd_tombos::text, 'N')            as "Qtd Tombos"
  from public.v_materiais m
 where m.ativo
 order by m.codigo;

revoke all on public.espelho_entidades, public.espelho_materiais from public, anon, authenticated;
grant select on public.espelho_entidades, public.espelho_materiais to service_role;

-- ---------------------------------------------------------------------
-- 3. Carga inicial a partir da planilha (só pela chave secreta, só até a
--    carga ser marcada como concluída em Configurações)
-- ---------------------------------------------------------------------
create or replace function public.lista_id(p_tabela text, p_nome text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_nome text := nullif(regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g'), '');
begin
  if v_nome is null then return null; end if;
  if p_tabela not in ('municipios','tipologias','territorios','zonas','tipos_ambiente','funcoes_responsavel') then
    raise exception 'Lista inválida: %', p_tabela;
  end if;
  execute format('select id from public.%I where lower(nome) = lower($1)', p_tabela) into v_id using v_nome;
  if v_id is null then
    execute format('insert into public.%I (nome) values ($1) returning id', p_tabela) into v_id using v_nome;
  end if;
  return v_id;
end $$;
revoke all on function public.lista_id(text, text) from public, anon, authenticated;

create or replace function public.importar_entidades(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_pend jsonb := '[]'::jsonb;
  v_incl int := 0; v_alt int := 0; v_lidas int := 0;
  v_inep text; v_cnpj text; v_gre bigint; v_cod text; v_nomegre text; v_existe boolean; v_id text;
  v_antes jsonb;
begin
  if (select carga_inicial_concluida from public.configuracao where id = 1) then
    raise exception 'A carga inicial já foi concluída. Agora os cadastros são feitos só no sistema.';
  end if;
  perform set_config('app.origem', 'carga inicial (planilha)', true);

  -- códigos novos começam depois do maior código existente no banco ou na planilha
  perform setval('public.entidades_seq', greatest(
            (select coalesce(max(substring(id from '^E(\d+)$')::int), 0) from public.entidades),
            (select coalesce(max(substring(upper(trim(p->>'id')) from '^E(\d+)$')::int), 0) from jsonb_array_elements(payload) p),
            1), true);

  for r in
    select row_number() over () + 1 as linha, x.*
      from jsonb_to_recordset(payload) as x(id text, inep text, nome text, municipio text, gre_cidade text, gre text,
                                            endereco text, plus_code text, tipologia text, territorio text,
                                            bairro text, cnpj text, zona text)
  loop
    if nullif(trim(r.nome), '') is null then continue; end if;
    v_lidas := v_lidas + 1;
    v_id := nullif(upper(trim(r.id)), '');

    if nullif(trim(r.tipologia), '') is null then
      v_pend := v_pend || jsonb_build_object('linha', r.linha, 'registro', r.nome, 'problema', 'Sem tipologia: linha não importada');
      continue;
    end if;

    v_inep := nullif(regexp_replace(coalesce(r.inep, ''), '\D', '', 'g'), '');
    if v_inep is not null and v_inep !~ '^\d{8}$' then
      v_pend := v_pend || jsonb_build_object('linha', r.linha, 'registro', r.nome, 'problema', 'INEP inválido (' || r.inep || '): importado sem INEP');
      v_inep := null;
    end if;
    if v_inep is not null and exists (select 1 from public.entidades where inep = v_inep and id is distinct from v_id) then
      v_pend := v_pend || jsonb_build_object('linha', r.linha, 'registro', r.nome, 'problema', 'INEP ' || v_inep || ' repetido em outra entidade: importado sem INEP');
      v_inep := null;
    end if;

    v_cnpj := nullif(regexp_replace(coalesce(r.cnpj, ''), '\D', '', 'g'), '');
    if v_cnpj is not null and not public.cnpj_valido(v_cnpj) then
      v_pend := v_pend || jsonb_build_object('linha', r.linha, 'registro', r.nome, 'problema', 'CNPJ inválido (' || r.cnpj || '): importado sem CNPJ');
      v_cnpj := null;
    end if;

    -- GRE: "01ª - PARNAÍBA" (coluna GRE/CIDADE) ou só "01ª" (coluna GRE)
    v_gre := null;
    v_cod := nullif(trim(split_part(coalesce(r.gre_cidade, ''), ' - ', 1)), '');
    v_nomegre := nullif(trim(substr(coalesce(r.gre_cidade, ''), length(coalesce(v_cod, '')) + 4)), '');
    v_cod := coalesce(v_cod, nullif(trim(r.gre), ''));
    if v_cod is not null then
      select id into v_gre from public.gres where lower(codigo) = lower(v_cod);
      if v_gre is null then
        insert into public.gres (codigo, nome) values (v_cod, coalesce(v_nomegre, v_cod)) returning id into v_gre;
      end if;
    end if;

    v_existe := v_id is not null and exists (select 1 from public.entidades where id = v_id);
    if v_existe then
      select to_jsonb(e) into v_antes from public.entidades e where id = v_id;
      update public.entidades set
        inep = v_inep, nome = trim(r.nome),
        tipologia_id = public.lista_id('tipologias', r.tipologia),
        municipio_id = public.lista_id('municipios', r.municipio),
        gre_id = v_gre,
        territorio_id = public.lista_id('territorios', r.territorio),
        zona_id = public.lista_id('zonas', r.zona),
        bairro = nullif(trim(r.bairro), ''), endereco = nullif(trim(r.endereco), ''),
        plus_code = nullif(trim(r.plus_code), ''), cnpj = v_cnpj
      where id = v_id;
      if (select to_jsonb(e) - 'atualizado_em' - 'atualizado_por' from public.entidades e where id = v_id)
         is distinct from (v_antes - 'atualizado_em' - 'atualizado_por') then
        v_alt := v_alt + 1;
      end if;
    else
      if v_id is not null and v_id !~ '^E\d{5,}$' then
        v_pend := v_pend || jsonb_build_object('linha', r.linha, 'registro', r.nome, 'problema', 'ID SISTEMA fora do padrão (' || v_id || '): recebeu código novo');
        v_id := null;
      end if;
      insert into public.entidades (id, inep, nome, tipologia_id, municipio_id, gre_id, territorio_id, zona_id,
                                    bairro, endereco, plus_code, cnpj)
      values (coalesce(v_id, 'E' || lpad(nextval('public.entidades_seq')::text, 5, '0')), v_inep, trim(r.nome),
              public.lista_id('tipologias', r.tipologia), public.lista_id('municipios', r.municipio), v_gre,
              public.lista_id('territorios', r.territorio), public.lista_id('zonas', r.zona),
              nullif(trim(r.bairro), ''), nullif(trim(r.endereco), ''), nullif(trim(r.plus_code), ''), v_cnpj);
      v_incl := v_incl + 1;
      if v_id is null then
        v_pend := v_pend || jsonb_build_object('linha', r.linha, 'registro', r.nome, 'problema', 'Sem ID SISTEMA: recebeu código novo (será gravado na planilha pelo espelho)');
      end if;
    end if;

    if public.lista_id('municipios', r.municipio) is null then
      v_pend := v_pend || jsonb_build_object('linha', r.linha, 'registro', r.nome, 'problema', 'Sem município');
    end if;
  end loop;

  return jsonb_build_object('lidas', v_lidas, 'incluidas', v_incl, 'alteradas', v_alt,
                            'no_banco_fora_da_planilha',
                              (select count(*) from public.entidades e
                                where not exists (select 1 from jsonb_array_elements(payload) p
                                                   where upper(trim(p->>'id')) = e.id) and e.criado_em < now()),
                            'pendencias', v_pend);
end $$;

create or replace function public.importar_materiais(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_pend jsonb := '[]'::jsonb;
  v_incl int := 0; v_alt int := 0; v_lidas int := 0;
  v_classe bigint; v_prefixo text; v_tipo text; v_qtd int; v_cod text; v_antes jsonb;
begin
  if (select carga_inicial_concluida from public.configuracao where id = 1) then
    raise exception 'A carga inicial já foi concluída. Agora os cadastros são feitos só no sistema.';
  end if;
  perform set_config('app.origem', 'carga inicial (planilha)', true);

  for r in
    select row_number() over () + 1 as linha, x.*
      from jsonb_to_recordset(payload) as x(codigo text, descricao text, classe text, tipo text, qtd text)
  loop
    if nullif(trim(r.descricao), '') is null then continue; end if;
    v_lidas := v_lidas + 1;
    v_cod := upper(trim(coalesce(r.codigo, '')));

    if v_cod !~ '^[A-Z]{3}-\d{4,}$' then
      v_pend := v_pend || jsonb_build_object('linha', r.linha, 'registro', r.descricao, 'problema', 'Código fora do padrão (' || coalesce(r.codigo, 'vazio') || '): linha não importada');
      continue;
    end if;
    if nullif(trim(r.classe), '') is null then
      v_pend := v_pend || jsonb_build_object('linha', r.linha, 'registro', r.descricao, 'problema', 'Sem classe: linha não importada');
      continue;
    end if;

    v_prefixo := split_part(v_cod, '-', 1);
    select id into v_classe from public.classes_material where lower(nome) = lower(trim(r.classe));
    if v_classe is null then
      if exists (select 1 from public.classes_material where prefixo = v_prefixo) then
        v_pend := v_pend || jsonb_build_object('linha', r.linha, 'registro', r.descricao, 'problema', 'Prefixo ' || v_prefixo || ' já pertence a outra classe: linha não importada');
        continue;
      end if;
      insert into public.classes_material (nome, prefixo) values (trim(r.classe), v_prefixo) returning id into v_classe;
    elsif (select prefixo from public.classes_material where id = v_classe) <> v_prefixo then
      v_pend := v_pend || jsonb_build_object('linha', r.linha, 'registro', r.descricao, 'problema', 'Código ' || v_cod || ' com prefixo diferente do da classe ' || r.classe || ': importado mesmo assim, revisar');
    end if;

    v_tipo := initcap(lower(trim(coalesce(r.tipo, ''))));
    if v_tipo not in ('Singular','Composto','Kit','Quantitativo') then
      v_pend := v_pend || jsonb_build_object('linha', r.linha, 'registro', r.descricao, 'problema', 'Tipo de controle inválido (' || coalesce(r.tipo, 'vazio') || '): linha não importada');
      continue;
    end if;

    v_qtd := case when trim(coalesce(r.qtd, '')) ~ '^\d+$' then trim(r.qtd)::int end;
    if v_tipo = 'Composto' and v_qtd is not null and v_qtd < 2 then
      v_pend := v_pend || jsonb_build_object('linha', r.linha, 'registro', r.descricao, 'problema', 'Composto com menos de 2 tombos: importado como variável, revisar');
      v_qtd := null;
    end if;

    if exists (select 1 from public.materiais where lower(trim(descricao)) = lower(trim(r.descricao)) and codigo <> v_cod) then
      v_pend := v_pend || jsonb_build_object('linha', r.linha, 'registro', r.descricao, 'problema', 'Descrição repetida em outro código: linha não importada');
      continue;
    end if;

    if exists (select 1 from public.materiais where codigo = v_cod) then
      select to_jsonb(m) into v_antes from public.materiais m where codigo = v_cod;
      update public.materiais set descricao = trim(r.descricao), classe_id = v_classe, tipo_controle = v_tipo, qtd_tombos = v_qtd
       where codigo = v_cod;
      if (select to_jsonb(m) - 'atualizado_em' - 'atualizado_por' from public.materiais m where codigo = v_cod)
         is distinct from (v_antes - 'atualizado_em' - 'atualizado_por') then
        v_alt := v_alt + 1;
      end if;
    else
      insert into public.materiais (codigo, descricao, classe_id, tipo_controle, qtd_tombos)
      values (v_cod, trim(r.descricao), v_classe, v_tipo, v_qtd);
      v_incl := v_incl + 1;
    end if;
  end loop;

  return jsonb_build_object('lidas', v_lidas, 'incluidas', v_incl, 'alteradas', v_alt, 'pendencias', v_pend);
end $$;

revoke all on function public.importar_entidades(jsonb), public.importar_materiais(jsonb) from public, anon, authenticated;
grant execute on function public.importar_entidades(jsonb), public.importar_materiais(jsonb) to service_role;

-- ---------------------------------------------------------------------
-- 4. Qualidade dos cadastros (tela Início)
-- ---------------------------------------------------------------------
create or replace function public.qualidade_cadastros()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  v_ano int := extract(year from current_date)::int;
begin
  if not public.eh_usuario() then raise exception 'Acesso negado.'; end if;
  return jsonb_build_object(
    'entidades',           (select count(*) from entidades where ativo),
    'escolas',             (select count(*) from v_entidades where ativo and eh_escola),
    'ambientes',           (select count(*) from ambientes where ativo),
    'materiais',           (select count(*) from materiais where ativo),
    'fornecedores',        (select count(*) from fornecedores where ativo),
    'contratos_vigentes',  (select count(*) from contratos_situacao where situacao = 'Vigente'),
    'ano',                 v_ano,
    'pendencias', jsonb_build_array(
      jsonb_build_object('chave', 'escola_sem_inep', 'rotulo', 'Escolas sem INEP',
        'ids', (select coalesce(jsonb_agg(id order by id), '[]') from v_entidades where ativo and eh_escola and inep is null)),
      jsonb_build_object('chave', 'sem_municipio', 'rotulo', 'Entidades sem município',
        'ids', (select coalesce(jsonb_agg(id order by id), '[]') from entidades where ativo and municipio_id is null)),
      jsonb_build_object('chave', 'sem_gre', 'rotulo', 'Entidades sem GRE',
        'ids', (select coalesce(jsonb_agg(id order by id), '[]') from entidades where ativo and gre_id is null)),
      jsonb_build_object('chave', 'sem_cnpj', 'rotulo', 'Escolas sem CNPJ',
        'ids', (select coalesce(jsonb_agg(id order by id), '[]') from v_entidades where ativo and eh_escola and cnpj is null)),
      jsonb_build_object('chave', 'cnpj_repetido', 'rotulo', 'Entidades com CNPJ repetido',
        'ids', (select coalesce(jsonb_agg(id order by id), '[]') from entidades e where ativo and cnpj is not null
                  and exists (select 1 from entidades o where o.cnpj = e.cnpj and o.id <> e.id and o.ativo))),
      jsonb_build_object('chave', 'sem_endereco', 'rotulo', 'Entidades sem endereço',
        'ids', (select coalesce(jsonb_agg(id order by id), '[]') from entidades where ativo and endereco is null)),
      jsonb_build_object('chave', 'sem_plus_code', 'rotulo', 'Entidades sem Plus Code (localização)',
        'ids', (select coalesce(jsonb_agg(id order by id), '[]') from entidades where ativo and plus_code is null)),
      jsonb_build_object('chave', 'sem_matricula', 'rotulo', 'Escolas sem matrícula de ' || v_ano,
        'ids', (select coalesce(jsonb_agg(e.id order by e.id), '[]') from v_entidades e where e.ativo and e.eh_escola
                  and not exists (select 1 from matriculas_anuais m where m.entidade_id = e.id and m.ano = v_ano))),
      jsonb_build_object('chave', 'sem_ambientes', 'rotulo', 'Escolas sem ambientes cadastrados',
        'ids', (select coalesce(jsonb_agg(e.id order by e.id), '[]') from v_entidades e where e.ativo and e.eh_escola
                  and not exists (select 1 from ambientes a where a.entidade_id = e.id and a.ativo))),
      jsonb_build_object('chave', 'salas_divergentes', 'rotulo', 'Escolas com salas de aula informadas diferentes das cadastradas',
        'ids', (select coalesce(jsonb_agg(d.entidade_id order by d.entidade_id), '[]') from dados_escola d
                  where d.salas_aula is not null
                    and exists (select 1 from ambientes a where a.entidade_id = d.entidade_id and a.ativo)
                    and d.salas_aula <> (select count(*) from ambientes a join tipos_ambiente t on t.id = a.tipo_id
                                          where a.entidade_id = d.entidade_id and a.ativo and t.nome = 'Sala de aula'))),
      jsonb_build_object('chave', 'sem_responsavel', 'rotulo', 'Escolas sem diretor(a) vigente',
        'ids', case when (select modulo_servidores_ativo from configuracao where id = 1) then
                 (select coalesce(jsonb_agg(e.id order by e.id), '[]') from v_entidades e where e.ativo and e.eh_escola
                   and not exists (select 1 from entidade_responsaveis r join funcoes_responsavel f on f.id = r.funcao_id
                                    where r.entidade_id = e.id and r.fim is null and f.nome = 'Diretor(a)'))
               else '[]'::jsonb end)
    ),
    'contratos_a_vencer', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'numero', numero, 'fornecedor', fornecedor,
                                                                         'vigencia_atual', vigencia_atual, 'dias', dias_para_vencer)
                                                     order by dias_para_vencer), '[]')
                             from contratos_situacao where situacao = 'Vigente' and dias_para_vencer <= 90)
  );
end $$;
revoke all on function public.qualidade_cadastros() from public, anon;
grant execute on function public.qualidade_cadastros() to authenticated;

-- ---------------------------------------------------------------------
-- 5. Sequências usadas nos códigos padrão (E00001, A000001, F00001...)
-- ---------------------------------------------------------------------
grant usage on all sequences in schema public to authenticated;
