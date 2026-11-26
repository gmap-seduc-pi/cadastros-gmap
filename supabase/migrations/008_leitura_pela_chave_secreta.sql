-- =====================================================================
-- 008 · Leitura pela chave secreta (service_role)
--
-- Projetos novos do Supabase não concedem mais, automaticamente, leitura
-- das tabelas à chave secreta. Sem isso, o Apps Script da planilha falha ao
-- atualizar o espelho ("permission denied for table configuracao").
--
-- Concede SOMENTE LEITURA. A chave secreta continua sem gravar diretamente:
-- gravações dela passam só pelas funções de carga (importar_*), que já têm
-- permissão própria. Nada muda para os usuários do site.
-- =====================================================================

grant usage on schema public to service_role;
grant select on all tables in schema public to service_role;   -- tabelas e visões já existentes
grant execute on function public.cnpj_formatado(text), public.cnpj_valido(text) to service_role;

-- Tabelas e visões criadas em migrações futuras também ficam legíveis pela chave secreta
alter default privileges in schema public grant select on tables to service_role;
