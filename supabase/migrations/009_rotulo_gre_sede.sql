-- =====================================================================
-- 009 · Rótulo da GRE igual ao da planilha quando código e nome coincidem
--
-- Na planilha, entidades da sede usam só "SEDE" em GRE/CIDADE. A carga
-- guardou essa GRE com código e nome "SEDE", e o rótulo virou "SEDE - SEDE".
-- A coluna GRE/CIDADE da planilha tem validação (lista suspensa) e recusou o
-- valor, interrompendo o espelho. Agora, quando o nome repete o código, o
-- rótulo é só o código ("SEDE"), como na planilha.
-- Só muda a visão de leitura: nenhum dado é alterado.
-- =====================================================================

create or replace view public.v_entidades with (security_invoker = true) as
select e.id, e.inep, e.nome,
       e.nome || coalesce(' - ' || e.inep, '') || coalesce(' - ' || m.nome, '') as nome_inep,
       e.tipologia_id, t.nome as tipologia, t.eh_escola,
       e.municipio_id, m.nome as municipio,
       e.gre_id, g.codigo as gre, case when g.nome is null or upper(trim(g.nome)) = upper(trim(g.codigo)) then g.codigo else g.rotulo end as gre_rotulo,
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
