-- Dados fictícios da demonstração. Roda no banco de teste local depois de
-- supabase/testes/rodar_testes.sh. NÃO execute no Supabase.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';

insert into territorios (nome) values ('TD 11 - ENTRE RIOS'), ('TD 08 - VALE DO GUARIBAS') on conflict do nothing;
insert into municipios (nome) values ('TERESINA'), ('PICOS'), ('FLORIANO') on conflict do nothing;
insert into gres (codigo, nome) values ('04ª', 'TERESINA'), ('09ª', 'PICOS'), ('10ª', 'FLORIANO');
insert into zonas (nome) values ('Capital') on conflict do nothing;
insert into tipologias (nome) values ('Regular') on conflict do nothing;
insert into tipologias (nome, eh_escola) values ('Sede', false) on conflict do nothing;

insert into entidades (nome, inep, tipologia_id, municipio_id, gre_id, territorio_id, zona_id, bairro, endereco, plus_code) values
 ('U.E. EXEMPLO PROFESSORA ANA LIMA', '22000101', (select id from tipologias where nome='Regular'), (select id from municipios where nome='TERESINA'),
  (select id from gres where codigo='04ª'), (select id from territorios where nome='TD 11 - ENTRE RIOS'), (select id from zonas where nome='Capital'), 'CENTRO', 'Rua Fictícia, 100 - Centro, Teresina - PI', '8JQ2+XX Teresina, PI'),
 ('CETI EXEMPLO JOSÉ COSTA', '22000102', (select id from tipologias where nome='CETI'), (select id from municipios where nome='PICOS'),
  (select id from gres where codigo='09ª'), (select id from territorios where nome='TD 08 - VALE DO GUARIBAS'), (select id from zonas where nome='Interior'), 'JUNCO', 'Av. Exemplo, 200 - Junco, Picos - PI', null),
 ('U.E. EXEMPLO MARIA SOUSA', null, (select id from tipologias where nome='Regular'), (select id from municipios where nome='FLORIANO'),
  (select id from gres where codigo='10ª'), null, (select id from zonas where nome='Interior'), null, null, null),
 ('SEDE SEDUC (EXEMPLO)', null, (select id from tipologias where nome='Sede'), (select id from municipios where nome='TERESINA'),
  (select id from gres where codigo='04ª'), null, (select id from zonas where nome='Capital'), 'CENTRO', 'Av. Exemplo da Sede, s/n', null);

insert into dados_escola (entidade_id, salas_aula) select id, 12 from entidades where inep = '22000101';
insert into matriculas_anuais (entidade_id, ano, quantidade, fonte)
  select id, a, q, 'Censo Escolar' from entidades, (values (2024, 610), (2025, 590)) v(a, q) where inep = '22000101';
insert into matriculas_anuais (entidade_id, ano, quantidade, fonte) select id, 2026, 575, 'Informada' from entidades where inep = '22000101';

insert into ambientes (entidade_id, tipo_id, identificacao, bloco, pavimento, capacidade)
select e.id, (select id from tipos_ambiente where nome = t), i, b, p, c
  from entidades e, (values ('Sala de aula','Sala 01','A','Térreo',40), ('Sala de aula','Sala 02','A','Térreo',40), ('Sala de aula','Sala 03','A','1º andar',40),
                            ('Laboratório de informática','Lab. Informática','B','Térreo',30), ('Biblioteca','Biblioteca','B','Térreo',null),
                            ('Secretaria','Secretaria','Adm','Térreo',null), ('Cozinha','Cozinha','B','Térreo',null)) v(t,i,b,p,c)
 where e.inep = '22000101';

insert into materiais (descricao, classe_id, tipo_controle, qtd_tombos) values
 ('Cadeira Fixa Estofada', (select id from classes_material where prefixo='MOB'), 'Singular', 1),
 ('Conjunto Professor', (select id from classes_material where prefixo='MOB'), 'Composto', 2),
 ('Chromebook', (select id from classes_material where prefixo='INF'), 'Singular', 1),
 ('Impressora', (select id from classes_material where prefixo='INF'), 'Singular', 1),
 ('Bola Futsal', (select id from classes_material where prefixo='OUT'), 'Quantitativo', 0);
insert into classes_material (nome, prefixo) values ('SPLIT', 'SPL'), ('ELETRO', 'ELE');
insert into materiais (descricao, classe_id, tipo_controle, qtd_tombos) values
 ('Split 12000 BTUs', (select id from classes_material where prefixo='SPL'), 'Composto', 2),
 ('Split 24000 BTUs', (select id from classes_material where prefixo='SPL'), 'Composto', 2),
 ('Geladeira', (select id from classes_material where prefixo='ELE'), 'Singular', 1),
 ('Bebedouro Industrial', (select id from classes_material where prefixo='ELE'), 'Singular', 1);

insert into fornecedores (cnpj, razao_social, nome_fantasia, email, telefone, municipio, uf) values
 ('11.222.333/0001-81', 'Empresa Exemplo Climatização Ltda', 'Exemplo Clima', 'contato@exemploclima.com.br', '(86) 3222-1000', 'TERESINA', 'PI');
insert into contratos (numero, processo_sei, fornecedor_id, objeto, modalidade, valor_global, data_assinatura, vigencia_inicio, vigencia_fim)
values ('015/2025', '00012.000999/2025-10', (select id from fornecedores where cnpj='11222333000181'),
        'Manutenção preventiva e corretiva de aparelhos de ar-condicionado das escolas estaduais', 'Pregão eletrônico',
        850000, current_date - 380, current_date - 375, current_date - 10),
       ('022/2026', null, (select id from fornecedores where cnpj='11222333000181'), 'Instalação de aparelhos de ar-condicionado (exemplo)', 'Adesão a ata',
        120000, current_date - 20, current_date - 15, current_date + 45);
insert into contrato_aditivos (contrato_id, numero, tipo, data_assinatura, nova_vigencia_fim, valor_alteracao)
select id, '1º Termo Aditivo', 'Prazo e valor', current_date - 12, current_date + 355, 212500 from contratos where numero = '015/2025';

-- estado inicial da demonstração: carga em andamento e módulo de servidores aguardando autorização
reset role;
update configuracao set carga_inicial_concluida = false, modulo_servidores_ativo = false,
       modulo_servidores_autorizacao = null where id = 1;
update perfis set nome = 'Felipe (gestor, exemplo)' where email = 'gestor@seduc.pi.gov.br';
update perfis set nome = 'Técnico GMAP (exemplo)' where email = 'tecnico@seduc.pi.gov.br';
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000d', 'novo.tecnico@seduc.pi.gov.br', '{"origem":"cadastros-gmap","nome":"Servidor Pendente (exemplo)"}');
update auditoria set usuario_nome = 'Felipe (gestor, exemplo)' where usuario_nome = 'Gestor Teste';
update auditoria set usuario_nome = 'Técnico GMAP (exemplo)' where usuario_nome = 'Técnico Teste';
