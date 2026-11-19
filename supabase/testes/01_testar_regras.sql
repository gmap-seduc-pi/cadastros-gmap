-- Testes das regras do banco em PostgreSQL local (depois de 00_simular_supabase.sql e das migrações).
-- NÃO execute no Supabase. Cada bloco imprime OK ou interrompe com erro.
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned

-- Usuários: um gestor (admin) e um técnico, criados pelo site
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'gestor@seduc.pi.gov.br', '{"origem":"cadastros-gmap","nome":"Gestor Teste"}'),
  ('00000000-0000-0000-0000-00000000000b', 'tecnico@seduc.pi.gov.br', '{"origem":"cadastros-gmap","nome":"Técnico Teste"}'),
  ('00000000-0000-0000-0000-00000000000c', 'outro@x.com', '{}');
select 'OK cadastro pelo site fica pendente' where (select count(*) from perfis where situacao = 'pendente') = 2;
-- primeiro gestor (script primeiro_gestor.sql)
update perfis set perfil = 'admin', situacao = 'aprovado' where email = 'gestor@seduc.pi.gov.br';

-- ===== carga inicial pela chave secreta =====
set role service_role;
select 'carga entidades: ' || importar_entidades('[
 {"id":"E00001","inep":"22129723","nome":"CETI DARCY RIBEIRO","municipio":"BOM PRINCÍPIO DO PIAUÍ","gre_cidade":"01ª - PARNAÍBA","gre":"01ª","endereco":"Rua José Bernado, S/N","plus_code":"R956+JV8","tipologia":"CETI","territorio":"TD 01 - PLANICIE LITORÂNEA","bairro":"CENTRO","cnpj":"06.179.810/0001-33","zona":"Interior"},
 {"id":"E00002","inep":"22012508","nome":"CEJA LEÔNIDAS MELO","municipio":"BURITI DOS LOPES","gre_cidade":"01ª - PARNAÍBA","gre":"01ª","tipologia":"CEJA | EJA","cnpj":"01.758.145/0001-19","zona":"Interior"},
 {"id":"E00003","inep":"22012508","nome":"ESCOLA COM INEP REPETIDO","municipio":"buriti dos lopes","gre_cidade":"01ª - PARNAÍBA","tipologia":"CETI","cnpj":"11.111.111/1111-11"},
 {"id":"","inep":"123","nome":"GRE PARNAÍBA","municipio":"PARNAÍBA","gre_cidade":"01ª - PARNAÍBA","tipologia":"GRE"}
]'::jsonb)::text;
select 'carga materiais: ' || importar_materiais('[
 {"codigo":"MOB-0001","descricao":"Armário Aço 02 Portas","classe":"MOBILIARIO","tipo":"Singular","qtd":"1"},
 {"codigo":"INF-0002","descricao":"Computador de Mesa","classe":"INFORMATICA","tipo":"Composto","qtd":"2"},
 {"codigo":"MUS-0001","descricao":"Conjunto Banda Rítmica","classe":"INSTRUMENTOS MUSICAIS","tipo":"Kit","qtd":"N"},
 {"codigo":"OUT-2001","descricao":"Kit AEE","classe":"Outros","tipo":"Kit","qtd":"N"},
 {"codigo":"XX1","descricao":"Linha ruim","classe":"Outros","tipo":"Kit","qtd":"N"}
]'::jsonb)::text;
select 'OK municípios sem duplicar por maiúscula' where (select count(*) from municipios where lower(nome) = 'buriti dos lopes') = 1;
select 'OK GRE criada uma vez com rótulo' where (select string_agg(rotulo, ',') from gres) = '01ª - PARNAÍBA';
select 'OK sequência continua após E00003: GRE recebeu ' || id from entidades where nome = 'GRE PARNAÍBA' and id = 'E00004';
select 'OK espelho: ' || row_to_json(e)::text from espelho_entidades e where "ID SISTEMA" = 'E00001';
select 'OK espelho materiais N: ' || row_to_json(m)::text from espelho_materiais m where "Código" = 'MUS-0001';
reset role;
select 'OK auditoria da carga com origem' where exists (select 1 from auditoria where origem = 'carga inicial (planilha)');

-- ===== técnico pendente não vê nada =====
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select 'OK pendente não lê entidades' where (select count(*) from entidades) = 0;

-- gestor aprova o técnico
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select decidir_usuario('00000000-0000-0000-0000-00000000000b', 'aprovar', 'tecnico');
select 'OK gestor lista usuários: ' || count(*) from listar_usuarios();
update tipologias set eh_escola = false where nome = 'GRE';
select 'OK GRE marcada como não escola' where not (select eh_escola from tipologias where nome = 'GRE');

-- ===== técnico =====
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select 'OK técnico lê entidades: ' || count(*) from entidades;
do $$ begin
  begin
    insert into entidades (nome, tipologia_id, municipio_id) values ('NOVA', 1, 1);
    raise exception 'FALHA: técnico conseguiu incluir entidade';
  exception when insufficient_privilege then raise notice 'OK técnico não inclui entidade';
  end;
end $$;
insert into ambientes (entidade_id, tipo_id, identificacao) values ('E00001', (select id from tipos_ambiente where nome = 'Sala de aula'), 'Sala 01');
select 'OK técnico incluiu ambiente ' || id from ambientes where identificacao = 'Sala 01';
do $$ begin
  begin
    insert into ambientes (entidade_id, tipo_id, identificacao) values ('E00001', 1, ' sala 01 ');
    raise exception 'FALHA: ambiente repetido aceito';
  exception when unique_violation then raise notice 'OK ambiente repetido recusado';
  end;
  begin
    delete from ambientes where identificacao = 'Sala 01';
    raise exception 'FALHA: exclusão permitida';
  exception when insufficient_privilege then raise notice 'OK ninguém exclui';
  end;
  begin
    update ambientes set ativo = false where identificacao = 'Sala 01';
    raise exception 'FALHA: inativação sem motivo aceita';
  exception when check_violation then raise notice 'OK inativar exige motivo';
  end;
  begin
    update ambientes set id = 'A999999' where identificacao = 'Sala 01';
    raise exception 'FALHA: código alterado';
  exception when raise_exception then raise notice 'OK código não muda: %', sqlerrm;
  end;
end $$;

-- ===== gestor =====
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
update entidades set endereco = 'Rua Nova, 10', cnpj = '06179810000133' where id = 'E00001';
select 'OK auditoria registra só o que mudou: ' || array_to_string(campos, ',') || ' por ' || usuario_nome
  from auditoria where tabela = 'entidades' and registro = 'E00001' and operacao = 'alteracao' order by id desc limit 1;
do $$ begin
  begin
    update entidades set cnpj = '11.111.111/1111-11' where id = 'E00001';
    raise exception 'FALHA: CNPJ inválido aceito';
  exception when check_violation then raise notice 'OK CNPJ inválido recusado';
  end;
  begin
    insert into dados_escola (entidade_id, salas_aula) values ('E00004', 3);
    raise exception 'FALHA: dado de escola em GRE';
  exception when raise_exception then raise notice 'OK dado escolar só em escola';
  end;
end $$;
insert into dados_escola (entidade_id, salas_aula) values ('E00001', 2);
insert into matriculas_anuais (entidade_id, ano, quantidade, fonte) values ('E00001', extract(year from now())::int, 480, 'Informada');
insert into materiais (descricao, classe_id, tipo_controle, qtd_tombos) values ('Mesa Teste', (select id from classes_material where prefixo = 'MOB'), 'Singular', 1);
select 'OK código gerado: ' || codigo from materiais where descricao = 'Mesa Teste' and codigo = 'MOB-0002';
insert into fornecedores (cnpj, razao_social) values ('06.179.810/0001-33', 'Fornecedor Teste Ltda');
insert into contratos (numero, fornecedor_id, objeto, valor_global, vigencia_inicio, vigencia_fim)
  values ('001/2026', 'F00001', 'Manutenção de climatização', 100000, current_date - 300, current_date + 30);
insert into contrato_aditivos (contrato_id, numero, tipo, nova_vigencia_fim, valor_alteracao)
  values ('C00001', '1º Termo Aditivo', 'Prazo e valor', current_date + 395, 25000);
select 'OK contrato: ' || situacao || ', valor atual ' || valor_atual || ', aditivos ' || aditivos from contratos_situacao;

-- ===== módulo de servidores travado =====
do $$ begin
  begin
    insert into servidores (nome, cargo, telefone) values ('Maria da Silva', 'Diretora', '(86) 99999-0000');
    raise exception 'FALHA: servidor incluído com módulo desativado';
  exception when raise_exception then raise notice 'OK módulo travado: %', sqlerrm;
  end;
  begin
    perform definir_modulo_servidores(true, '');
    raise exception 'FALHA: ativado sem referência';
  exception when raise_exception then raise notice 'OK ativação exige referência';
  end;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  begin
    perform definir_modulo_servidores(true, 'SEI 00001.000001/2026-00');
    raise exception 'FALHA: técnico ativou módulo';
  exception when raise_exception then raise notice 'OK técnico não ativa módulo';
  end;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select definir_modulo_servidores(true, 'SEI 00001.000001/2026-00');
insert into servidores (nome, cargo, telefone) values ('Maria da Silva', 'Diretora', '(86) 99999-0000'), ('João Souza', 'Diretor', '86988887777');
select definir_responsavel('E00001', (select id from funcoes_responsavel where nome = 'Diretor(a)'), (select id from servidores where nome = 'Maria da Silva'), current_date - 100);
select definir_responsavel('E00001', (select id from funcoes_responsavel where nome = 'Diretor(a)'), (select id from servidores where nome = 'João Souza'), current_date);
select 'OK troca de responsável guarda histórico: ' || string_agg(servidor || case when vigente then ' (vigente)' else ' até ' || fim end, '; ' order by inicio)
  from v_responsaveis where entidade_id = 'E00001';
insert into contrato_fiscais (contrato_id, servidor_id, papel) values ('C00001', (select id from servidores where nome = 'João Souza'), 'Fiscal técnico');

-- ===== qualidade =====
select 'OK qualidade: ' || (select string_agg(p->>'chave' || '=' || jsonb_array_length(p->'ids'), ' ')
                              from jsonb_array_elements(qualidade_cadastros()->'pendencias') p);

-- ===== carga concluída bloqueia nova importação =====
select concluir_carga_inicial();
reset role;
set role service_role;
do $$ begin
  begin
    perform importar_entidades('[]'::jsonb);
    raise exception 'FALHA: importou após conclusão';
  exception when raise_exception then raise notice 'OK carga bloqueada após conclusão';
  end;
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  begin
    perform 1 from espelho_entidades;
    raise exception 'FALHA: usuário lê o espelho';
  exception when insufficient_privilege then raise notice 'OK espelho só pela chave secreta';
  end;
end $$;
reset role;
select 'OK registros de auditoria: ' || count(*) from auditoria;
select 'TODOS OS TESTES PASSARAM';
