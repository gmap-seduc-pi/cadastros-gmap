# Cadastros GMAP

Base única de cadastros da Gerência de Material e Patrimônio (GMAP) da SEDUC-PI. Substitui a planilha **BASE - CADASTROS** como fonte oficial de entidades, ambientes, materiais, fornecedores, contratos e servidores, e serve de alicerce para os sistemas do setor (Painel de O.S., Kanban GMAP e o futuro sistema patrimonial).

## O que o sistema faz

- **Entidades:** escolas, GREs e sede, com INEP e CNPJ validados, listas controladas (GRE, município, tipologia, território, zona), dados escolares e matrículas por ano.
- **Ambientes:** salas, laboratórios e demais espaços de cada entidade. Serão a localização física dos bens no sistema patrimonial.
- **Materiais:** catálogo com classe, tipo de controle e tombos por unidade. Código gerado pelo prefixo da classe (MOB-0001).
- **Fornecedores e contratos:** CNPJ único, vigência e valor atuais calculados a partir dos aditivos.
- **Servidores** (módulo travado até autorização da gerência): só nome, cargo e telefone; responsáveis pelas entidades e fiscais de contrato com período, sem sobrescrever o histórico.
- **Início:** pendências de preenchimento (escolas sem INEP, sem ambientes, sem matrícula do ano...) e contratos que vencem em 90 dias.
- **Auditoria:** toda inclusão e alteração fica registrada pelo próprio banco, com autor, data, valor anterior e novo.

### Perfis

| Perfil | Pode |
|---|---|
| **Gestor dos cadastros** | Editar tudo, aprovar usuários, ativar o módulo de servidores, concluir a carga inicial |
| **Técnico GMAP** | Consultar tudo e cadastrar ou editar ambientes |

As permissões são aplicadas no banco (RLS), não só na tela.

### Regras de governança

1. **Nada é apagado.** Registros são inativados com motivo e podem ser reativados.
2. **Códigos não mudam.** E00001, A000001, MOB-0001, F00001, C00001, S00001 são permanentes e são a chave usada pelos outros sistemas.
3. **Histórico em vez de sobrescrita.** Matrículas por ano, responsáveis e fiscais por período, aditivos sobre o contrato original.
4. **Dados pessoais mínimos.** Servidores: só nome, cargo e telefone. Nenhum dado pessoal vai para a planilha espelho, que é publicada na web.

## Como funciona

```
Interface (docs/, GitHub Pages) ──► Supabase (PostgreSQL + RLS + auditoria)
                                           │
              Apps Script da planilha ◄────┘  espelho diário, só dados não pessoais
              BASE - CADASTROS ──► Painel de O.S. (importa às 5h) e Kanban (CSV publicado)
```

Durante a **carga inicial**, o caminho é o inverso: a planilha é enviada ao banco quantas vezes for preciso. Quando um gestor marca a carga como concluída, o banco vira a fonte e a planilha passa a ser só espelho.

## Estrutura do repositório

| Pasta | Conteúdo |
|---|---|
| `docs/` | Interface web (HTML, CSS e JavaScript puros). O nome `docs` é exigido pelo GitHub Pages |
| `supabase/migrations/` | Estrutura do banco, uma alteração por arquivo numerado, aplicadas em ordem |
| `supabase/scripts/` | Rotinas de administração (primeiro gestor, consultas de acompanhamento) |
| `supabase/testes/` | Testes das regras do banco em PostgreSQL local (não executar no Supabase) |
| `demo/` | Demonstração testável (`demonstracao.html`): a interface real com banco simulado e dados fictícios. Abre direto no navegador |
| `apps-script/` | Cópia versionada do script da planilha BASE - CADASTROS (carga inicial e espelho) |
| `manual/` | Implantação, modelo de dados e integração com os outros sistemas |
| `.github/` | Modelos de solicitação de melhoria, de correção e de revisão |

## Demonstração

Antes de implantar qualquer versão, abra `demo/demonstracao.html` no navegador e teste com os perfis Gestor e Técnico (seletor "Ver como" no canto inferior esquerdo). Toda mudança na interface deve regerar a demonstração: `python3 demo/gerar_demo.py` (e `demo/atualizar_dados.sh` se o banco mudou).

## Documentação

- [`manual/IMPLANTACAO.txt`](manual/IMPLANTACAO.txt): passo a passo para colocar no ar.
- [`manual/MODELO_DE_DADOS.txt`](manual/MODELO_DE_DADOS.txt): tabelas, códigos e como acrescentar campos novos.
- [`manual/INTEGRACAO.txt`](manual/INTEGRACAO.txt): como o Painel de O.S., o Kanban e sistemas futuros consomem a base.

## Regras do repositório

1. **Nenhum segredo no repositório.** A chave secreta do Supabase fica só nas Propriedades do script do Apps Script. O `docs/config.js` contém só a URL e a chave **pública**, que pode ser exposta porque o banco protege os dados por perfil.
2. **Nenhum dado no repositório.** Planilhas e exportações (`.xlsx`, `.csv`, `.pdf`) não são versionadas.
3. **Alterações por branch e pull request.** A branch `main` é a versão publicada. Toda mudança nasce em uma branch, passa por pull request e é revisada pela outra pessoa da equipe.
4. **Banco só por migração.** Nunca edite uma migração já aplicada. Crie `supabase/migrations/NNN_descricao.sql`, rode os testes locais, aplique no SQL Editor e registre no `CHANGELOG.md`.
5. **O Apps Script é editado lá e copiado para cá** no mesmo pull request.
6. **Toda versão vem com a demonstração atualizada** em `demo/demonstracao.html`, testada antes da implantação.
7. **Toda versão publicada entra no `CHANGELOG.md`** e recebe uma tag (`v1.0.0`, `v1.1.0`...). Ao publicar, troque o `?v=` dos arquivos em `docs/index.html`.

## Padrão de mensagens de commit

`tipo: descrição curta no imperativo`

| Tipo | Quando usar | Exemplo |
|---|---|---|
| `feat` | Nova funcionalidade | `feat: adiciona cadastro de veículos` |
| `fix` | Correção de erro | `fix: corrige filtro por GRE` |
| `db` | Migração do banco | `db: adiciona coluna turnos em dados_escola` |
| `docs` | Só documentação | `docs: atualiza passo da carga inicial` |
| `style` | Visual, sem mudar regra | `style: ajusta tabela no celular` |
| `refactor` | Reorganização sem mudar comportamento | `refactor: separa seções do detalhe` |
| `chore` | Manutenção geral | `chore: atualiza supabase-js` |

## Versionamento

`MAIOR.MENOR.CORREÇÃO`: **CORREÇÃO** para consertos, **MENOR** para funcionalidade nova compatível, **MAIOR** para mudança que exige ação dos usuários ou dos sistemas que consomem a base (ex.: renomear uma coluna do espelho).

## Responsáveis

Equipe técnica da GMAP | SEDUC-PI.
