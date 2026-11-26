# Histórico de versões

Formato: [MAIOR.MENOR.CORREÇÃO] · data · o que mudou. Migrações do banco citadas pelo número.

## [1.0.1] · 2026-11-26

### Correção
- Migração 008: leitura das tabelas pela chave secreta. Projetos novos do Supabase não concedem mais essa permissão automaticamente, e o espelho da planilha falhava com "permission denied for table configuracao". Só leitura: a chave secreta continua sem gravar diretamente.
- Testes do banco passam a simular projetos novos do Supabase (sem privilégios automáticos).

## [1.0.0] · 2026-11-19

Primeira versão.

### Banco (migrações 001 a 007)
- Perfis Gestor dos cadastros e Técnico GMAP, com solicitação de acesso e aprovação pelos gestores.
- Auditoria automática de toda inclusão e alteração (autor, data, antes e depois, registro pai).
- Nenhum registro pode ser apagado; inativação exige motivo. Códigos permanentes.
- Listas controladas: GREs, municípios, tipologias (com indicação de escola), territórios, zonas, tipos de ambiente, funções de responsável, classes de material.
- Entidades com validação de INEP e CNPJ; dados escolares; matrículas por ano; ambientes.
- Materiais com código gerado pelo prefixo da classe.
- Fornecedores, contratos e aditivos, com vigência e valor atuais calculados.
- Módulo de servidores (nome, cargo, telefone), responsáveis e fiscais com período, travado até autorização da gerência.
- Visões de leitura, espelho da planilha sem dados pessoais, carga inicial pela chave secreta e quadro de pendências.

### Documentação
- Manuais em texto simples (`manual/*.txt`), legíveis no Bloco de Notas.

### Interface
- Listas com busca, filtros, ordenação e exportação; detalhe com seções ligadas e histórico de alterações.
- Telas Início (pendências e contratos a vencer), Listas, Auditoria, Usuários e Configurações.
- Navegação pelo menu independente do endereço da página: funciona também em molduras que bloqueiam a mudança de endereço, mantendo o botão Voltar do navegador quando permitido.

### Demonstração
- `demo/demonstracao.html`: interface completa com banco simulado no navegador, dados fictícios e troca de perfil (gestor e técnico).

### Apps Script
- `Cadastros.gs`: carga inicial da planilha BASE - CADASTROS e espelho diário (4h) para o Painel de O.S. e o Kanban.
