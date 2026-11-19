-- =====================================================================
-- Consultas úteis para acompanhamento (SQL Editor do Supabase)
-- Só leitura: nada aqui altera dados.
-- =====================================================================

-- Últimas 50 alterações, com autor
select em, usuario_nome, origem, tabela, registro, operacao, campos
  from public.auditoria order by em desc limit 50;

-- Alterações por pessoa nos últimos 30 dias
select coalesce(usuario_nome, origem) as autor, tabela, count(*) as alteracoes
  from public.auditoria where em > now() - interval '30 days'
 group by 1, 2 order by 1, 3 desc;

-- Histórico completo de uma entidade (dela e dos registros ligados a ela)
select em, usuario_nome, tabela, registro, operacao, antes, depois
  from public.auditoria
 where (tabela = 'entidades' and registro = 'E00001') or pai = 'E00001'
 order by em;

-- Escolas sem ambientes cadastrados
select e.id, e.nome, e.municipio, e.gre
  from public.v_entidades e
 where e.ativo and e.eh_escola
   and not exists (select 1 from public.ambientes a where a.entidade_id = e.id and a.ativo)
 order by e.gre, e.municipio, e.nome;

-- Contratos vigentes que vencem em até 90 dias
select numero, fornecedor, vigencia_atual, dias_para_vencer
  from public.contratos_situacao
 where situacao = 'Vigente' and dias_para_vencer <= 90
 order by dias_para_vencer;

-- Conferir o que o espelho vai gravar na planilha
select * from public.espelho_entidades limit 20;
select * from public.espelho_materiais limit 20;
