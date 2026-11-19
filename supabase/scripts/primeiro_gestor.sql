-- =====================================================================
-- Liberar o primeiro gestor dos cadastros
-- Use uma única vez, depois de solicitar acesso pelo site com o seu e-mail.
-- Os próximos usuários são aprovados pela tela Usuários do próprio sistema.
-- =====================================================================
update public.perfis
   set perfil = 'admin', situacao = 'aprovado', decidido_em = now()
 where email = 'SEU_EMAIL@seduc.pi.gov.br';   -- troque pelo e-mail usado na solicitação

insert into public.perfis_log (usuario, acao, detalhe)
select user_id, 'aprovado pelo SQL Editor', 'primeiro gestor' from public.perfis where email = 'SEU_EMAIL@seduc.pi.gov.br';

select email, perfil, situacao from public.perfis;
