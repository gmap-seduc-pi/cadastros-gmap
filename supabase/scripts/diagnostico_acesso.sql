-- =====================================================================
-- Diagnóstico de acesso: simula o seu usuário (gestor) e testa cada
-- consulta que as telas fazem. Só leitura: termina com ROLLBACK.
-- Rode no SQL Editor e copie o resultado.
-- =====================================================================
begin;

-- 1. Quem é o gestor e quais permissões a função "authenticated" tem
select set_config('diag.priv', (
  select string_agg(item || ' => ' || resultado, E'\n') from (
    select 'perfil ' || email as item, perfil || ' | ' || situacao as resultado from public.perfis
    union all select 'uso do esquema public', has_schema_privilege('authenticated', 'public', 'usage')::text
    union all select 'leitura em gres', has_table_privilege('authenticated', 'public.gres', 'select')::text
    union all select 'executar eh_usuario', has_function_privilege('authenticated', 'public.eh_usuario()', 'execute')::text
    union all select 'executar listar_usuarios', has_function_privilege('authenticated', 'public.listar_usuarios()', 'execute')::text
    union all select 'executar qualidade_cadastros', has_function_privilege('authenticated', 'public.qualidade_cadastros()', 'execute')::text
    union all select 'executar cnpj_formatado', has_function_privilege('authenticated', 'public.cnpj_formatado(text)', 'execute')::text) x), true);

-- 2. Simula o login do gestor e executa as consultas das telas
select set_config('request.jwt.claims', json_build_object('sub', user_id::text, 'role', 'authenticated')::text, true),
       set_config('request.jwt.claim.sub', user_id::text, true)
  from public.perfis where perfil = 'admin' and situacao = 'aprovado' limit 1;
set local role authenticated;
do $$
declare t text; r text; saida text := '';
begin
  foreach t in array array[
    'select auth.uid()::text',
    'select public.meu_perfil()',
    'select public.eh_usuario()::text',
    'select count(*)::text from public.gres',
    'select count(*)::text from public.listar_usuarios()',
    'select (public.qualidade_cadastros() is not null)::text',
    'select count(*)::text from public.v_entidades',
    'select count(*)::text from public.configuracao'] loop
    begin
      execute t into r;
      saida := saida || 'OK   | ' || t || ' => ' || coalesce(r, 'vazio') || E'\n';
    exception when others then
      saida := saida || 'ERRO | ' || t || ' => ' || sqlerrm || ' (' || sqlstate || ')' || E'\n';
    end;
  end loop;
  perform set_config('diag.saida', saida, true);
end $$;
reset role;
select unnest(string_to_array(current_setting('diag.priv') || E'\n' || trim(trailing E'\n' from current_setting('diag.saida')), E'\n')) as diagnostico;

rollback;
