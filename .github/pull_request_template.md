## O que muda

<!-- Descreva a mudança em poucas linhas. -->

## Por quê

<!-- Qual problema ou demanda motivou. Cite a issue, se houver: Resolve #12 -->

## Como foi testado

- [ ] Testes do banco (`supabase/testes/rodar_testes.sh`), se o banco mudou
- [ ] Perfil Gestor dos cadastros
- [ ] Perfil Técnico GMAP (só consulta e ambientes)
- [ ] Espelho da planilha conferido, se as visões `espelho_*` mudaram

## Conferência

- [ ] Nenhuma chave secreta, ID de planilha ou dado pessoal incluído
- [ ] Nova migração em `supabase/migrations/`, se o banco mudou (nunca editar uma já aplicada)
- [ ] `apps-script/` atualizado, se o script da planilha mudou
- [ ] Demonstração regerada (`demo/demonstracao.html`) e testada
- [ ] `?v=` atualizado em `docs/index.html`, se a interface mudou
- [ ] `CHANGELOG.md` atualizado
