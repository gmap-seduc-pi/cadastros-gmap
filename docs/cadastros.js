/* Cadastros GMAP · SEDUC-PI
   Definição de cada cadastro: tabela, colunas da lista, campos do formulário e
   detalhes. Para acrescentar um campo novo: crie a coluna em uma migração e
   inclua o campo aqui (em "campos" e, se quiser vê-lo na lista, em "colunas"). */
(function () {
  const { fmt, cnpjValido } = window.UI;

  const vInep = v => /^\d{8}$/.test(v) ? null : "deve ter 8 dígitos.";
  const vCnpj = v => cnpjValido(v) ? null : "CNPJ inválido (confira os dígitos).";
  const vTel = v => /^\d{10,11}$/.test(String(v).replace(/\D/g, "")) ? null : "informe DDD e número (10 ou 11 dígitos).";
  const vEmail = v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? null : "e-mail inválido.";
  const vNaoNeg = v => v >= 0 ? null : "não pode ser negativo.";

  // Listas controladas: de onde vêm as opções e como aparecem
  const LISTAS = {
    gres:                { titulo: "GREs", rotulo: o => o.rotulo, ordem: "codigo",
                           campos: [{ c: "codigo", t: "Código", obrig: true, aj: "Ex.: 01ª" }, { c: "nome", t: "Nome", obrig: true, aj: "Ex.: PARNAÍBA" }] },
    municipios:          { titulo: "Municípios", rotulo: o => o.nome, ordem: "nome",
                           campos: [{ c: "nome", t: "Nome", obrig: true }, { c: "uf", t: "UF", obrig: true, max: 2 }] },
    tipologias:          { titulo: "Tipologias", rotulo: o => o.nome, ordem: "nome",
                           campos: [{ c: "nome", t: "Nome", obrig: true }, { c: "eh_escola", t: "É escola (permite matrículas e dados escolares)", tipo: "bool" }] },
    territorios:         { titulo: "Territórios", rotulo: o => o.nome, ordem: "nome", campos: [{ c: "nome", t: "Nome", obrig: true, largo: true }] },
    zonas:               { titulo: "Zonas", rotulo: o => o.nome, ordem: "nome", campos: [{ c: "nome", t: "Nome", obrig: true }] },
    tipos_ambiente:      { titulo: "Tipos de ambiente", rotulo: o => o.nome, ordem: "nome", campos: [{ c: "nome", t: "Nome", obrig: true, largo: true }] },
    funcoes_responsavel: { titulo: "Funções de responsável", rotulo: o => o.nome, ordem: "nome", campos: [{ c: "nome", t: "Nome", obrig: true, largo: true }] },
    classes_material:    { titulo: "Classes de material", rotulo: o => o.nome, ordem: "nome",
                           campos: [{ c: "nome", t: "Nome", obrig: true }, { c: "prefixo", t: "Prefixo do código", obrig: true, soCriar: true, max: 3,
                                      aj: "3 letras maiúsculas (ex.: MOB). Não pode ser mudado depois.", valida: v => /^[A-Z]{3}$/.test(v) ? null : "use 3 letras maiúsculas." }] }
  };

  // Referências a outros cadastros (campos com busca)
  const REFS = {
    entidades:    { visao: "v_entidades", chave: "id", sel: "id,nome,municipio,ativo,eh_escola", rotulo: o => `${o.id} · ${o.nome}${o.municipio ? " (" + o.municipio + ")" : ""}` },
    fornecedores: { visao: "fornecedores", chave: "id", sel: "id,razao_social,cnpj,ativo", rotulo: o => `${o.id} · ${o.razao_social} · ${fmt.cnpj(o.cnpj)}` },
    servidores:   { visao: "servidores", chave: "id", sel: "id,nome,cargo,ativo", rotulo: o => `${o.id} · ${o.nome}${o.cargo ? " · " + o.cargo : ""}` },
    contratos:    { visao: "contratos", chave: "id", sel: "id,numero,objeto,ativo", rotulo: o => `${o.id} · ${o.numero} · ${String(o.objeto).slice(0, 50)}` }
  };

  const SITUACAO_CONTRATO = { "Vigente": "ok", "A iniciar": "info", "Encerrado": "gray", "Inativo": "gray" };

  const CADASTROS = {
    entidades: {
      titulo: "Entidades", novo: "Nova entidade", singular: "entidade", grupo: "Cadastros", tabela: "entidades", visao: "v_entidades", pk: "id",
      descricao: "Escolas, GREs, sede e demais unidades. É a base que alimenta o Painel de O.S., o Kanban e o futuro sistema patrimonial.",
      ordem: "nome", rotulo: r => r.nome,
      busca: ["id", "inep", "nome", "municipio", "bairro", "cnpj"],
      filtros: [{ c: "gre_rotulo", t: "GRE" }, { c: "tipologia", t: "Tipologia" }, { c: "municipio", t: "Município" }, { c: "zona", t: "Zona" }],
      colunas: [
        { c: "id", t: "Código", cod: true }, { c: "inep", t: "INEP", cod: true }, { c: "nome", t: "Nome" },
        { c: "tipologia", t: "Tipologia" }, { c: "municipio", t: "Município" }, { c: "gre", t: "GRE" }
      ],
      campos: [
        { c: "nome", t: "Nome", obrig: true, largo: true },
        { c: "inep", t: "INEP", aj: "8 dígitos. Deixe vazio se não for escola.", valida: vInep },
        { c: "tipologia_id", t: "Tipologia", tipo: "lista", lista: "tipologias", obrig: true },
        { c: "municipio_id", t: "Município", tipo: "lista", lista: "municipios", obrig: true },
        { c: "gre_id", t: "GRE", tipo: "lista", lista: "gres" },
        { c: "territorio_id", t: "Território", tipo: "lista", lista: "territorios" },
        { c: "zona_id", t: "Zona", tipo: "lista", lista: "zonas" },
        { c: "cnpj", t: "CNPJ", valida: vCnpj, formatar: fmt.cnpj },
        { c: "bairro", t: "Bairro" },
        { c: "endereco", t: "Endereço", largo: true },
        { c: "plus_code", t: "Google Plus Code", aj: "Localização no Google Maps. Ex.: R956+JV8 Bom Princípio do Piauí, PI", largo: true }
      ],
      detalhe: [
        { c: "inep", t: "INEP" }, { c: "tipologia", t: "Tipologia" }, { c: "municipio", t: "Município" }, { c: "gre_rotulo", t: "GRE" },
        { c: "territorio", t: "Território" }, { c: "zona", t: "Zona" }, { c: "cnpj_formatado", t: "CNPJ" }, { c: "bairro", t: "Bairro" },
        { c: "endereco", t: "Endereço", largo: true },
        { c: "plus_code", t: "Localização", largo: true, html: r => r.plus_code ? `<a href="https://www.google.com/maps/search/${encodeURIComponent(r.plus_code)}" target="_blank" rel="noopener">${window.UI.esc(r.plus_code)} ↗</a>` : "" }
      ],
      secoes: ["escola", "matriculas", "ambientes", "responsaveis"],
      exportar: ["id", "inep", "nome", "nome_inep", "tipologia", "municipio", "gre_rotulo", "territorio", "zona", "bairro", "endereco", "plus_code", "cnpj_formatado", "ativo"]
    },

    ambientes: {
      titulo: "Ambientes", novo: "Novo ambiente", singular: "ambiente", grupo: "Cadastros", tabela: "ambientes", visao: "v_ambientes", pk: "id",
      descricao: "Salas, laboratórios e demais espaços de cada entidade. Serão a localização física dos bens no sistema patrimonial.",
      ordem: "entidade", rotulo: r => `${r.identificacao} · ${r.entidade}`,
      busca: ["id", "identificacao", "entidade", "inep", "bloco", "municipio"],
      filtros: [{ c: "tipo", t: "Tipo" }, { c: "gre", t: "GRE" }, { c: "municipio", t: "Município" }],
      colunas: [
        { c: "id", t: "Código", cod: true }, { c: "entidade", t: "Entidade" }, { c: "tipo", t: "Tipo" },
        { c: "identificacao", t: "Identificação" }, { c: "bloco", t: "Bloco" }, { c: "pavimento", t: "Pavimento" }
      ],
      campos: [
        { c: "entidade_id", t: "Entidade", tipo: "ref", ref: "entidades", obrig: true, largo: true, soCriar: true },
        { c: "tipo_id", t: "Tipo", tipo: "lista", lista: "tipos_ambiente", obrig: true },
        { c: "identificacao", t: "Identificação", obrig: true, aj: "Como o ambiente é conhecido na escola. Ex.: Sala 01" },
        { c: "bloco", t: "Bloco" }, { c: "pavimento", t: "Pavimento", aj: "Ex.: Térreo, 1º andar" },
        { c: "capacidade", t: "Capacidade (pessoas)", tipo: "numero", valida: vNaoNeg },
        { c: "observacao", t: "Observação", tipo: "area" }
      ],
      detalhe: [
        { c: "entidade", t: "Entidade", largo: true }, { c: "tipo", t: "Tipo" }, { c: "identificacao", t: "Identificação" },
        { c: "bloco", t: "Bloco" }, { c: "pavimento", t: "Pavimento" }, { c: "capacidade", t: "Capacidade" },
        { c: "observacao", t: "Observação", largo: true }
      ],
      exportar: ["id", "entidade_id", "entidade", "inep", "municipio", "gre", "tipo", "identificacao", "bloco", "pavimento", "capacidade", "observacao", "ativo"]
    },

    materiais: {
      titulo: "Materiais", novo: "Novo material", singular: "material", grupo: "Cadastros", tabela: "materiais", visao: "v_materiais", pk: "codigo",
      descricao: "Catálogo de materiais com classe, tipo de controle e quantidade de tombos por unidade. O código é gerado pelo prefixo da classe.",
      ordem: "codigo", rotulo: r => r.descricao,
      busca: ["codigo", "descricao", "classe"],
      filtros: [{ c: "classe", t: "Classe" }, { c: "tipo_controle", t: "Tipo de controle" }],
      colunas: [
        { c: "codigo", t: "Código", cod: true }, { c: "descricao", t: "Descrição" }, { c: "classe", t: "Classe" },
        { c: "tipo_controle", t: "Controle" }, { c: "qtd_tombos", t: "Tombos", f: r => r.qtd_tombos ?? "Variável" }
      ],
      campos: [
        { c: "descricao", t: "Descrição", obrig: true, largo: true },
        { c: "classe_id", t: "Classe", tipo: "lista", lista: "classes_material", obrig: true, aj: "Define o prefixo do código. Mudar a classe depois não muda o código." },
        { c: "tipo_controle", t: "Tipo de controle", tipo: "opcoes", opcoes: ["Singular", "Composto", "Kit", "Quantitativo"], obrig: true },
        { c: "qtd_tombos", t: "Tombos por unidade", tipo: "numero", aj: "Deixe vazio quando variar (kits).", valida: vNaoNeg },
        { c: "observacao", t: "Observação", tipo: "area" }
      ],
      detalhe: [
        { c: "classe", t: "Classe" }, { c: "tipo_controle", t: "Tipo de controle" },
        { c: "qtd_tombos", t: "Tombos por unidade", f: r => r.qtd_tombos ?? "Variável" }, { c: "observacao", t: "Observação", largo: true }
      ],
      exportar: ["codigo", "descricao", "classe", "tipo_controle", "qtd_tombos", "observacao", "ativo"]
    },

    fornecedores: {
      titulo: "Fornecedores", novo: "Novo fornecedor", singular: "fornecedor", grupo: "Contratações", tabela: "fornecedores", visao: "fornecedores", pk: "id",
      descricao: "Empresas contratadas e fornecedoras. O CNPJ é único e validado.",
      ordem: "razao_social", rotulo: r => r.razao_social,
      busca: ["id", "cnpj", "razao_social", "nome_fantasia", "municipio"],
      filtros: [{ c: "uf", t: "UF" }],
      colunas: [
        { c: "id", t: "Código", cod: true }, { c: "cnpj", t: "CNPJ", cod: true, f: r => fmt.cnpj(r.cnpj) },
        { c: "razao_social", t: "Razão social" }, { c: "nome_fantasia", t: "Nome fantasia" }, { c: "telefone", t: "Telefone", f: r => fmt.tel(r.telefone) }
      ],
      campos: [
        { c: "cnpj", t: "CNPJ", obrig: true, valida: vCnpj, soCriar: true, formatar: fmt.cnpj },
        { c: "razao_social", t: "Razão social", obrig: true, largo: true },
        { c: "nome_fantasia", t: "Nome fantasia", largo: true },
        { c: "email", t: "E-mail", valida: vEmail }, { c: "telefone", t: "Telefone", valida: vTel, formatar: fmt.tel },
        { c: "endereco", t: "Endereço", largo: true }, { c: "municipio", t: "Município" }, { c: "uf", t: "UF", max: 2 },
        { c: "observacao", t: "Observação", tipo: "area" }
      ],
      detalhe: [
        { c: "cnpj", t: "CNPJ", f: r => fmt.cnpj(r.cnpj) }, { c: "nome_fantasia", t: "Nome fantasia" },
        { c: "email", t: "E-mail" }, { c: "telefone", t: "Telefone", f: r => fmt.tel(r.telefone) },
        { c: "endereco", t: "Endereço", largo: true }, { c: "municipio", t: "Município", f: r => [r.municipio, r.uf].filter(Boolean).join(" / ") },
        { c: "observacao", t: "Observação", largo: true }
      ],
      secoes: ["contratos_fornecedor"],
      exportar: ["id", "cnpj", "razao_social", "nome_fantasia", "email", "telefone", "endereco", "municipio", "uf", "ativo"]
    },

    contratos: {
      titulo: "Contratos", novo: "Novo contrato", singular: "contrato", grupo: "Contratações", tabela: "contratos", visao: "contratos_situacao", pk: "id",
      descricao: "Contratos com vigência e valor originais. Aditivos atualizam a vigência e o valor atuais sem apagar o original.",
      ordem: "numero", rotulo: r => `Contrato ${r.numero}`,
      busca: ["id", "numero", "processo_sei", "fornecedor", "objeto"],
      filtros: [{ c: "situacao", t: "Situação do contrato" }, { c: "fornecedor", t: "Fornecedor" }],
      colunas: [
        { c: "numero", t: "Número", cod: true }, { c: "fornecedor", t: "Fornecedor" }, { c: "objeto", t: "Objeto", f: r => String(r.objeto).slice(0, 80) },
        { c: "vigencia_atual", t: "Vigência até", f: r => fmt.data(r.vigencia_atual) },
        { c: "valor_atual", t: "Valor atual", f: r => fmt.moeda(r.valor_atual) },
        { c: "situacao", t: "Situação", html: r => `<span class="selo ${SITUACAO_CONTRATO[r.situacao] || "gray"}">${r.situacao || ""}</span>` }
      ],
      campos: [
        { c: "numero", t: "Número do contrato", obrig: true, aj: "Ex.: 012/2025" },
        { c: "processo_sei", t: "Processo SEI" },
        { c: "fornecedor_id", t: "Fornecedor", tipo: "ref", ref: "fornecedores", obrig: true, largo: true },
        { c: "objeto", t: "Objeto", tipo: "area", obrig: true },
        { c: "modalidade", t: "Modalidade", aj: "Ex.: Pregão eletrônico, adesão a ata" },
        { c: "valor_global", t: "Valor global original (R$)", tipo: "moeda", valida: vNaoNeg },
        { c: "data_assinatura", t: "Data de assinatura", tipo: "data" },
        { c: "vigencia_inicio", t: "Início da vigência", tipo: "data", obrig: true },
        { c: "vigencia_fim", t: "Fim da vigência original", tipo: "data", obrig: true,
          valida: (v, d) => d.vigencia_inicio && v < d.vigencia_inicio ? "não pode ser anterior ao início." : null },
        { c: "observacao", t: "Observação", tipo: "area" }
      ],
      detalhe: [
        { c: "situacao", t: "Situação", html: r => `<span class="selo ${SITUACAO_CONTRATO[r.situacao] || "gray"}">${r.situacao || ""}</span>${r.situacao === "Vigente" ? ` <span class="${r.dias_para_vencer <= 90 ? "selo warn" : ""}">vence em ${r.dias_para_vencer} dias</span>` : ""}` },
        { c: "fornecedor", t: "Fornecedor" }, { c: "processo_sei", t: "Processo SEI" }, { c: "modalidade", t: "Modalidade" },
        { c: "objeto", t: "Objeto", largo: true },
        { c: "vigencia_inicio", t: "Vigência original", f: r => `${fmt.data(r.vigencia_inicio)} a ${fmt.data(r.vigencia_fim)}` },
        { c: "vigencia_atual", t: "Vigência atual (com aditivos)", f: r => fmt.data(r.vigencia_atual) },
        { c: "valor_global", t: "Valor original", f: r => fmt.moeda(r.valor_global) },
        { c: "valor_atual", t: "Valor atual (com aditivos)", f: r => fmt.moeda(r.valor_atual) },
        { c: "data_assinatura", t: "Assinatura", f: r => fmt.data(r.data_assinatura) },
        { c: "observacao", t: "Observação", largo: true }
      ],
      secoes: ["aditivos", "fiscais"],
      exportar: ["id", "numero", "processo_sei", "fornecedor", "objeto", "modalidade", "valor_global", "valor_atual", "vigencia_inicio", "vigencia_fim", "vigencia_atual", "situacao", "ativo"]
    },

    servidores: {
      titulo: "Servidores", novo: "Novo servidor", singular: "servidor", grupo: "Pessoas", tabela: "servidores", visao: "servidores", pk: "id", modulo: "servidores",
      descricao: "Responsáveis pelas entidades e fiscais de contrato. Por decisão da GMAP, guarda só nome, cargo e telefone.",
      ordem: "nome", rotulo: r => r.nome,
      busca: ["id", "nome", "cargo", "telefone"],
      filtros: [{ c: "cargo", t: "Cargo" }],
      colunas: [{ c: "id", t: "Código", cod: true }, { c: "nome", t: "Nome" }, { c: "cargo", t: "Cargo" }, { c: "telefone", t: "Telefone", f: r => fmt.tel(r.telefone) }],
      campos: [
        { c: "nome", t: "Nome completo", obrig: true, largo: true },
        { c: "cargo", t: "Cargo" },
        { c: "telefone", t: "Telefone", valida: vTel, aj: "Com DDD", formatar: fmt.tel }
      ],
      detalhe: [{ c: "cargo", t: "Cargo" }, { c: "telefone", t: "Telefone", f: r => fmt.tel(r.telefone) }],
      secoes: ["vinculos_servidor"],
      exportar: ["id", "nome", "cargo", "telefone", "ativo"]
    }
  };

  window.CAD = { CADASTROS, LISTAS, REFS, SITUACAO_CONTRATO, validadores: { vInep, vCnpj, vTel, vEmail, vNaoNeg } };
})();
