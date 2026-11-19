/* Cadastros GMAP · SEDUC-PI
   Telas: lista e detalhe genéricos de cada cadastro, seções ligadas (matrículas,
   ambientes, responsáveis, aditivos, fiscais), início, listas, auditoria,
   usuários e configurações. */
(function () {
  const { $, esc, semAcento, fmt, aviso, erroBanco, confirmar, formulario, baixarCsv, abrirJanela, fecharJanela } = window.UI;
  const { CADASTROS, LISTAS, REFS } = window.CAD;
  const A = () => window.APP;
  const sb = () => window.APP.sb;
  const POR_PAGINA = 50;

  // ---------------------------------------------------------------------
  // Dados
  // ---------------------------------------------------------------------
  async function carregarTodos(visao, sel = "*", ajustar) {
    const linhas = [];
    for (let de = 0; ; de += 1000) {
      let q = sb().from(visao).select(sel).range(de, de + 999);
      if (ajustar) q = ajustar(q);
      const { data, error } = await q;
      if (error) throw error;
      linhas.push(...data);
      if (data.length < 1000) break;
    }
    return linhas;
  }

  const cacheOpcoes = {};
  function limparCache(nome) { if (nome) delete cacheOpcoes[nome]; else Object.keys(cacheOpcoes).forEach(k => delete cacheOpcoes[k]); }

  async function opcoesDe(f) {
    if (f.tipo === "lista") {
      const L = LISTAS[f.lista];
      if (!cacheOpcoes[f.lista]) {
        const d = await carregarTodos(f.lista, "*", q => q.order(L.ordem));
        cacheOpcoes[f.lista] = d.map(o => ({ v: o.id, r: L.rotulo(o), ativo: o.ativo, o }));
      }
      return cacheOpcoes[f.lista];
    }
    if (f.tipo === "ref") {
      const R = REFS[f.ref];
      const k = "ref:" + f.ref;
      if (!cacheOpcoes[k]) {
        const d = await carregarTodos(R.visao, R.sel, q => q.order(R.chave));
        cacheOpcoes[k] = d.map(o => ({ v: o[R.chave], r: R.rotulo(o), ativo: o.ativo, o }));
      }
      return cacheOpcoes[k];
    }
    return null;
  }
  async function opcoesPara(campos) {
    const r = {};
    for (const f of campos) { const o = await opcoesDe(f); if (o) r[f.c] = o; }
    return r;
  }

  const ehAdmin = () => A().perfil === "admin";
  const podeEditar = tabela => ehAdmin() || (A().perfil === "tecnico" && tabela === "ambientes");
  const moduloServidores = () => !!A().config.modulo_servidores_ativo;
  const bloqueadoPorModulo = def => def.modulo === "servidores" && !moduloServidores();

  function selo(ativo) { return ativo === false ? `<span class="selo gray">Inativo</span>` : ""; }
  function valorCelula(col, r) {
    if (col.html) return col.html(r);
    const v = col.f ? col.f(r) : r[col.c];
    return esc(v ?? "");
  }

  // ---------------------------------------------------------------------
  // Lista genérica
  // ---------------------------------------------------------------------
  async function telaLista(chave, params) {
    const def = CADASTROS[chave];
    const tela = $("tela");
    const st = { busca: "", filtros: {}, situacao: "ativos", ordem: def.ordem, desc: false, pagina: 0,
                 ids: params.ids ? params.ids.split(",") : null, rotIds: params.rot || "" };
    const pode = podeEditar(def.tabela) && !bloqueadoPorModulo(def);

    tela.innerHTML = `
      <div class="cab"><div><h2>${esc(def.titulo)}</h2><div class="d">${esc(def.descricao)}</div></div>
        <div class="acoes">${pode ? `<button class="btn pri" id="bNovo">${esc(def.novo)}</button>` : ""}<button class="btn" id="bCsv">Exportar planilha</button></div></div>
      ${bloqueadoPorModulo(def) ? avisoModulo() : ""}
      <div id="fIds"></div>
      <div class="filtros">
        <div class="busca"><label for="fBusca">Buscar</label><input id="fBusca" type="search" placeholder="Código, nome ou outro dado"></div>
        ${def.filtros.map(f => `<div><label>${esc(f.t)}</label><select data-f="${f.c}"><option value="">Todos</option></select></div>`).join("")}
        <div><label>Situação</label><select id="fSit"><option value="ativos">Ativos</option><option value="inativos">Inativos</option><option value="todos">Todos</option></select></div>
      </div>
      <div class="tbl"><table><thead><tr>${def.colunas.map(c => `<th data-c="${c.c}">${esc(c.t)}</th>`).join("")}</tr></thead><tbody><tr><td colspan="${def.colunas.length}" class="carregando">Carregando...</td></tr></tbody></table></div>
      <div class="rodape"><span id="info"></span><span><button class="btn pq" id="pAnt">Anterior</button> <button class="btn pq" id="pProx">Próxima</button></span></div>`;

    let linhas = [];
    try { linhas = await carregarTodos(def.visao, "*", q => q.order(def.pk)); }
    catch (e) { tela.querySelector("tbody").innerHTML = `<tr><td colspan="${def.colunas.length}" class="vazio">${esc(erroBanco(e))}</td></tr>`; return; }

    // valores dos filtros
    def.filtros.forEach(f => {
      const vals = [...new Set(linhas.map(r => r[f.c]).filter(v => v != null && v !== ""))].sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));
      tela.querySelector(`[data-f="${f.c}"]`).insertAdjacentHTML("beforeend", vals.map(v => `<option>${esc(v)}</option>`).join(""));
    });

    const idx = linhas.map(r => semAcento(def.busca.map(c => r[c] ?? "").join(" ")));

    function filtradas() {
      const b = semAcento(st.busca).split(/\s+/).filter(Boolean);
      return linhas.filter((r, i) => {
        if (st.ids && !st.ids.includes(String(r[def.pk]))) return false;
        if (st.situacao === "ativos" && r.ativo === false) return false;
        if (st.situacao === "inativos" && r.ativo !== false) return false;
        for (const f in st.filtros) if (st.filtros[f] && String(r[f] ?? "") !== st.filtros[f]) return false;
        return b.every(p => idx[i].includes(p));
      }).sort((a, b) => {
        const x = a[st.ordem] ?? "", y = b[st.ordem] ?? "";
        const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR", { numeric: true });
        return st.desc ? -c : c;
      });
    }

    function desenhar() {
      const fs = filtradas();
      const tot = fs.length, ini = st.pagina * POR_PAGINA, pag = fs.slice(ini, ini + POR_PAGINA);
      $("fIds").innerHTML = st.ids ? `<div class="faixa info">Mostrando só: <b>${esc(st.rotIds || "registros selecionados")}</b> (${st.ids.length}). <a href="#/${chave}">Ver todos</a></div>` : "";
      tela.querySelector("tbody").innerHTML = pag.length ? pag.map(r => `<tr data-pk="${esc(r[def.pk])}" class="${r.ativo === false ? "inativo" : ""}">${def.colunas.map((c, i) =>
        `<td class="${c.cod ? "cod" : ""}">${valorCelula(c, r)}${i === 2 ? " " + selo(r.ativo) : ""}</td>`).join("")}</tr>`).join("")
        : `<tr><td colspan="${def.colunas.length}" class="vazio">Nenhum registro encontrado.</td></tr>`;
      tela.querySelectorAll("th").forEach(th => { th.classList.toggle("ord", th.dataset.c === st.ordem); th.classList.toggle("desc", th.dataset.c === st.ordem && st.desc); });
      $("info").textContent = tot ? `${fmt.num(ini + 1)} a ${fmt.num(Math.min(ini + POR_PAGINA, tot))} de ${fmt.num(tot)}` : "0 registros";
      $("pAnt").disabled = st.pagina === 0; $("pProx").disabled = ini + POR_PAGINA >= tot;
    }

    $("fBusca").oninput = e => { st.busca = e.target.value; st.pagina = 0; desenhar(); };
    $("fSit").onchange = e => { st.situacao = e.target.value; st.pagina = 0; desenhar(); };
    tela.querySelectorAll("[data-f]").forEach(s => s.onchange = () => { st.filtros[s.dataset.f] = s.value; st.pagina = 0; desenhar(); });
    tela.querySelectorAll("th").forEach(th => th.onclick = () => { if (st.ordem === th.dataset.c) st.desc = !st.desc; else { st.ordem = th.dataset.c; st.desc = false; } desenhar(); });
    $("pAnt").onclick = () => { st.pagina--; desenhar(); };
    $("pProx").onclick = () => { st.pagina++; desenhar(); };
    tela.querySelector("tbody").onclick = e => { const tr = e.target.closest("tr[data-pk]"); if (tr) abrirDetalhe(chave, tr.dataset.pk, () => telaLista(chave, params)); };
    $("bCsv").onclick = () => { const fs = filtradas(); baixarCsv(chave, def.exportar, fs.map(r => def.exportar.map(c => typeof r[c] === "boolean" ? fmt.simnao(r[c]) : r[c]))); };
    if (pode) $("bNovo").onclick = async () => {
      const pk = await novoRegistro(def);
      if (pk) { await telaLista(chave, params); abrirDetalhe(chave, pk, () => telaLista(chave, params)); }
    };
    desenhar();
    if (params.abrir) abrirDetalhe(chave, params.abrir, () => telaLista(chave, params));
  }

  function avisoModulo() {
    return `<div class="faixa warn"><b>Módulo aguardando autorização da gerência.</b> Os cadastros de servidores, responsáveis e fiscais ficam bloqueados até um gestor ativar o módulo em
      ${ehAdmin() ? `<a href="#/configuracoes">Configurações</a>` : "Configurações"}, informando a referência da autorização.</div>`;
  }

  async function novoRegistro(def, valores) {
    const opcoes = await opcoesPara(def.campos);
    let pk = null;
    const ok = await formulario({
      titulo: def.novo, campos: def.campos, valores: valores || {}, novo: true, opcoes,
      salvar: async d => {
        const { data, error } = await sb().from(def.tabela).insert(d).select(def.pk).single();
        if (error) throw error;
        pk = data[def.pk];
      }
    });
    if (ok) { aviso(`Registro incluído com o código ${pk}.`); limparCache("ref:" + def.tabela); }
    return ok ? pk : null;
  }

  // ---------------------------------------------------------------------
  // Detalhe genérico
  // ---------------------------------------------------------------------
  async function abrirDetalhe(chave, pk, aoMudar) {
    const def = CADASTROS[chave];
    const painel = $("detalhe");
    $("gaveta").classList.add("on");
    painel.innerHTML = `<div class="carregando">Carregando...</div>`;
    const { data: r, error } = await sb().from(def.visao).select("*").eq(def.pk, pk).maybeSingle();
    if (error || !r) { painel.innerHTML = `<button class="btn fechar" data-fechar>Fechar</button><div class="vazio">${esc(error ? erroBanco(error) : "Registro não encontrado.")}</div>`; painel.querySelector("[data-fechar]").onclick = window.UI.fecharDetalhe; return; }

    const pode = podeEditar(def.tabela) && !bloqueadoPorModulo(def);
    const recarregar = async () => { await abrirDetalhe(chave, pk, aoMudar); if (aoMudar) aoMudar(); };
    painel.innerHTML = `
      <button class="btn fechar" data-fechar>Fechar</button>
      <div class="tit"><div class="cod">${esc(def.singular.toUpperCase())} · ${esc(r[def.pk])}</div><h2>${esc(def.rotulo(r))} ${selo(r.ativo)}</h2></div>
      ${r.ativo === false ? `<div class="faixa warn">Inativo. Motivo: ${esc(r.motivo_inativacao || "não informado")}</div>` : ""}
      ${bloqueadoPorModulo(def) ? avisoModulo() : ""}
      <div class="acoes">${pode ? `<button class="btn pri" id="dEd">Editar</button>${r.ativo === false ? `<button class="btn" id="dRe">Reativar</button>` : `<button class="btn" id="dIn">Inativar</button>`}` : ""}</div>
      <div class="campos">${def.detalhe.map(c => `<div class="c ${c.largo ? "largo" : ""}"><div class="r">${esc(c.t)}</div><div class="v">${c.html ? c.html(r) : esc((c.f ? c.f(r) : r[c.c]) ?? "") || "<span class='selo gray'>não informado</span>"}</div></div>`).join("")}</div>
      <div id="dSecoes"></div>
      <div class="secao"><div class="cab"><h3>Histórico de alterações</h3></div><div id="dHist" class="hist"><div class="carregando">Carregando...</div></div></div>`;
    painel.querySelector("[data-fechar]").onclick = window.UI.fecharDetalhe;
    painel.scrollTop = 0;

    if (pode) {
      $("dEd").onclick = async () => {
        const { data: bruto, error: e2 } = await sb().from(def.tabela).select("*").eq(def.pk, pk).single();
        if (e2) return aviso(erroBanco(e2), true);
        const opcoes = await opcoesPara(def.campos);
        const ok = await formulario({ titulo: `Editar ${def.singular}`, sub: `Código ${esc(pk)}. Toda alteração fica registrada no histórico.`, campos: def.campos, valores: bruto, opcoes,
          salvar: async d => { const { error } = await sb().from(def.tabela).update(d).eq(def.pk, pk); if (error) throw error; } });
        if (ok) { aviso("Alterações salvas."); limparCache("ref:" + def.tabela); recarregar(); }
      };
      const bIn = $("dIn"), bRe = $("dRe");
      if (bIn) bIn.onclick = async () => {
        const motivo = await confirmar({ titulo: `Inativar ${def.singular}?`, texto: "O registro não é apagado: deixa de aparecer nas listas e nos sistemas que usam a base, e pode ser reativado depois.", botao: "Inativar", perigo: true, campoMotivo: "Motivo da inativação" });
        if (!motivo) return;
        const { error } = await sb().from(def.tabela).update({ ativo: false, motivo_inativacao: motivo }).eq(def.pk, pk);
        if (error) return aviso(erroBanco(error), true);
        aviso("Registro inativado."); limparCache("ref:" + def.tabela); recarregar();
      };
      if (bRe) bRe.onclick = async () => {
        if (!await confirmar({ titulo: `Reativar ${def.singular}?`, botao: "Reativar" })) return;
        const { error } = await sb().from(def.tabela).update({ ativo: true, motivo_inativacao: null }).eq(def.pk, pk);
        if (error) return aviso(erroBanco(error), true);
        aviso("Registro reativado."); limparCache("ref:" + def.tabela); recarregar();
      };
    }

    const caixa = $("dSecoes");
    for (const s of def.secoes || []) {
      const div = document.createElement("div"); div.className = "secao"; caixa.appendChild(div);
      try { await SECOES[s](r, div, recarregar); } catch (e) { div.innerHTML = `<div class="faixa warn">${esc(erroBanco(e))}</div>`; }
    }
    historico(def.tabela, String(pk), $("dHist"));
  }

  // ---------------------------------------------------------------------
  // Seções ligadas a um registro
  // ---------------------------------------------------------------------
  function miniTabela(cols, linhas, acoes) {
    if (!linhas.length) return `<div class="vazio" style="padding:12px">Nenhum registro.</div>`;
    return `<div class="tbl"><table class="mini"><thead><tr>${cols.map(c => `<th>${esc(c.t)}</th>`).join("")}${acoes ? "<th></th>" : ""}</tr></thead><tbody>${linhas.map((r, i) =>
      `<tr class="${r.ativo === false || r.vigente === false ? "inativo" : ""}">${cols.map(c => `<td>${c.html ? c.html(r) : esc((c.f ? c.f(r) : r[c.c]) ?? "")}</td>`).join("")}${acoes ? `<td style="white-space:nowrap">${acoes(r, i)}</td>` : ""}</tr>`).join("")}</tbody></table></div>`;
  }

  const SECOES = {
    async escola(e, div, recarregar) {
      if (!e.eh_escola) { div.remove(); return; }
      const [{ data: d }, { data: amb }] = await Promise.all([
        sb().from("dados_escola").select("*").eq("entidade_id", e.id).maybeSingle(),
        sb().from("v_ambientes").select("tipo").eq("entidade_id", e.id).eq("ativo", true)
      ]);
      const salas = (amb || []).filter(a => a.tipo === "Sala de aula").length;
      const pode = ehAdmin();
      const diverge = d && d.salas_aula != null && amb && amb.length && d.salas_aula !== salas;
      div.innerHTML = `<div class="cab"><h3>Dados da escola</h3>${pode ? `<button class="btn pq" id="sEsc">${d ? "Editar" : "Informar"}</button>` : ""}</div>
        <div class="campos"><div class="c"><div class="r">Salas de aula informadas</div><div class="v">${d?.salas_aula ?? "<span class='selo gray'>não informado</span>"}</div></div>
        <div class="c"><div class="r">Salas de aula cadastradas em Ambientes</div><div class="v">${salas} ${diverge ? `<span class="selo warn">diferente do informado</span>` : ""}</div></div>
        ${d?.observacao ? `<div class="c largo"><div class="r">Observação</div><div class="v">${esc(d.observacao)}</div></div>` : ""}</div>`;
      if (pode) div.querySelector("#sEsc").onclick = async () => {
        const ok = await formulario({ titulo: "Dados da escola", sub: esc(e.nome), valores: d || {},
          campos: [{ c: "salas_aula", t: "Salas de aula", tipo: "numero" }, { c: "observacao", t: "Observação", tipo: "area" }],
          salvar: async v => { const { error } = await sb().from("dados_escola").upsert({ entidade_id: e.id, ...v }); if (error) throw error; } });
        if (ok) recarregar();
      };
    },

    async matriculas(e, div, recarregar) {
      if (!e.eh_escola) { div.remove(); return; }
      const { data, error } = await sb().from("matriculas_anuais").select("*").eq("entidade_id", e.id).order("ano", { ascending: false });
      if (error) throw error;
      const pode = ehAdmin();
      const campos = [
        { c: "ano", t: "Ano", tipo: "numero", obrig: true, soCriar: true, valida: v => v >= 2000 && v <= 2100 ? null : "ano inválido." },
        { c: "quantidade", t: "Quantidade de matrículas", tipo: "numero", obrig: true },
        { c: "fonte", t: "Fonte", tipo: "opcoes", opcoes: ["Censo Escolar", "Sistema de gestão escolar", "Informada"], obrig: true },
        { c: "observacao", t: "Observação", tipo: "area" }];
      div.innerHTML = `<div class="cab"><h3>Matrículas por ano</h3>${pode ? `<button class="btn pq" id="sMatN">Registrar ano</button>` : ""}</div>
        ${miniTabela([{ c: "ano", t: "Ano" }, { c: "quantidade", t: "Matrículas", f: r => fmt.num(r.quantidade) }, { c: "fonte", t: "Fonte" }, { c: "observacao", t: "Observação" }],
          data, pode ? (r, i) => `<button class="btn pq" data-i="${i}">Editar</button>` : null)}`;
      if (!pode) return;
      div.querySelector("#sMatN").onclick = async () => {
        if (await formulario({ titulo: "Registrar matrículas", sub: esc(e.nome), campos, novo: true, valores: { ano: new Date().getFullYear(), fonte: "Informada" },
          salvar: async v => { const { error } = await sb().from("matriculas_anuais").insert({ entidade_id: e.id, ...v }); if (error) throw error; } })) recarregar();
      };
      div.querySelectorAll("[data-i]").forEach(b => b.onclick = async () => {
        const m = data[+b.dataset.i];
        if (await formulario({ titulo: `Matrículas de ${m.ano}`, sub: esc(e.nome), campos, valores: m,
          salvar: async v => { const { error } = await sb().from("matriculas_anuais").update(v).eq("id", m.id); if (error) throw error; } })) recarregar();
      });
    },

    async ambientes(e, div, recarregar) {
      const { data, error } = await sb().from("v_ambientes").select("*").eq("entidade_id", e.id).order("tipo").order("identificacao");
      if (error) throw error;
      const def = CADASTROS.ambientes;
      const pode = podeEditar("ambientes") && e.ativo !== false;
      const ativos = data.filter(a => a.ativo);
      div.innerHTML = `<div class="cab"><h3>Ambientes (${ativos.length} ativos)</h3>${pode ? `<button class="btn pq" id="sAmbN">Novo ambiente</button>` : ""}</div>
        ${miniTabela([{ c: "id", t: "Código" }, { c: "tipo", t: "Tipo" }, { c: "identificacao", t: "Identificação", html: r => esc(r.identificacao) + " " + selo(r.ativo) }, { c: "bloco", t: "Bloco" }, { c: "pavimento", t: "Pavimento" }],
          data, (r, i) => `<button class="btn pq" data-i="${i}">Abrir</button>`)}`;
      if (pode) div.querySelector("#sAmbN").onclick = async () => {
        const pk = await novoRegistro(def, { entidade_id: e.id });
        if (pk) recarregar();
      };
      div.querySelectorAll("[data-i]").forEach(b => b.onclick = () => abrirDetalhe("ambientes", data[+b.dataset.i].id, null));
    },

    async responsaveis(e, div, recarregar) {
      const { data, error } = await sb().from("v_responsaveis").select("*").eq("entidade_id", e.id).order("vigente", { ascending: false }).order("inicio", { ascending: false });
      if (error) throw error;
      const pode = ehAdmin() && moduloServidores() && e.ativo !== false;
      div.innerHTML = `<div class="cab"><h3>Responsáveis</h3>${pode ? `<button class="btn pq" id="sRespN">Definir responsável</button>` : ""}</div>
        ${moduloServidores() ? "" : `<div class="faixa warn">Módulo de servidores aguardando autorização da gerência.</div>`}
        ${miniTabela([{ c: "funcao", t: "Função" }, { c: "servidor", t: "Servidor" }, { c: "telefone", t: "Telefone", f: r => fmt.tel(r.telefone) },
          { c: "inicio", t: "Período", html: r => `${fmt.data(r.inicio)} a ${r.fim ? fmt.data(r.fim) : "<span class='selo ok'>atual</span>"}` }], data,
          pode ? (r, i) => r.vigente ? `<button class="btn pq" data-enc="${i}">Encerrar</button>` : "" : null)}`;
      if (!pode) return;
      div.querySelector("#sRespN").onclick = async () => {
        const campos = [
          { c: "funcao", t: "Função", tipo: "lista", lista: "funcoes_responsavel", obrig: true },
          { c: "servidor", t: "Servidor", tipo: "ref", ref: "servidores", obrig: true, largo: true, aj: "Se não estiver na lista, cadastre antes em Servidores." },
          { c: "inicio", t: "Início", tipo: "data", obrig: true },
          { c: "observacao", t: "Observação (ex.: portaria de nomeação)", tipo: "area" }];
        const ok = await formulario({ titulo: "Definir responsável", sub: `${esc(e.nome)}. Se já houver alguém na função, o vínculo anterior é encerrado no dia anterior ao início.`,
          campos, novo: true, valores: { inicio: new Date().toISOString().slice(0, 10) }, opcoes: await opcoesPara(campos),
          salvar: async v => { const { error } = await sb().rpc("definir_responsavel", { p_entidade: e.id, p_funcao: v.funcao, p_servidor: v.servidor, p_inicio: v.inicio, p_observacao: v.observacao }); if (error) throw error; } });
        if (ok) recarregar();
      };
      div.querySelectorAll("[data-enc]").forEach(b => b.onclick = async () => {
        const r = data[+b.dataset.enc];
        const ok = await formulario({ titulo: "Encerrar vínculo", sub: `${esc(r.servidor)} · ${esc(r.funcao)}`, campos: [{ c: "fim", t: "Último dia na função", tipo: "data", obrig: true }],
          valores: { fim: new Date().toISOString().slice(0, 10) },
          salvar: async v => { const { error } = await sb().from("entidade_responsaveis").update({ fim: v.fim }).eq("id", r.id); if (error) throw error; } });
        if (ok) recarregar();
      });
    },

    async contratos_fornecedor(f, div) {
      const { data, error } = await sb().from("contratos_situacao").select("*").eq("fornecedor_id", f.id).order("vigencia_inicio", { ascending: false });
      if (error) throw error;
      const def = CADASTROS.contratos;
      div.innerHTML = `<div class="cab"><h3>Contratos</h3></div>${miniTabela(def.colunas.filter(c => c.c !== "fornecedor"), data, (r, i) => `<button class="btn pq" data-i="${i}">Abrir</button>`)}`;
      div.querySelectorAll("[data-i]").forEach(b => b.onclick = () => abrirDetalhe("contratos", data[+b.dataset.i].id, null));
    },

    async aditivos(c, div, recarregar) {
      const { data, error } = await sb().from("contrato_aditivos").select("*").eq("contrato_id", c.id).order("data_assinatura", { ascending: true, nullsFirst: true });
      if (error) throw error;
      const pode = ehAdmin();
      const campos = [
        { c: "numero", t: "Identificação", obrig: true, aj: "Ex.: 1º Termo Aditivo" },
        { c: "tipo", t: "Tipo", tipo: "opcoes", opcoes: ["Prazo", "Valor", "Prazo e valor", "Outro"], obrig: true },
        { c: "data_assinatura", t: "Data de assinatura", tipo: "data" },
        { c: "processo_sei", t: "Processo SEI" },
        { c: "nova_vigencia_fim", t: "Nova data de fim da vigência", tipo: "data", aj: "Obrigatória para aditivos de prazo",
          valida: (v, d) => null },
        { c: "valor_alteracao", t: "Acréscimo ou supressão (R$)", tipo: "moeda", aj: "Use valor negativo para supressão. Obrigatório para aditivos de valor." },
        { c: "descricao", t: "Descrição", tipo: "area" }];
      const checar = d => {
        if (["Prazo", "Prazo e valor"].includes(d.tipo) && !d.nova_vigencia_fim) throw new Error("Aditivo de prazo exige a nova data de fim da vigência.");
        if (["Valor", "Prazo e valor"].includes(d.tipo) && d.valor_alteracao == null) throw new Error("Aditivo de valor exige o valor do acréscimo ou supressão.");
      };
      div.innerHTML = `<div class="cab"><h3>Aditivos</h3>${pode ? `<button class="btn pq" id="sAdN">Registrar aditivo</button>` : ""}</div>
        ${miniTabela([{ c: "numero", t: "Aditivo" }, { c: "tipo", t: "Tipo" }, { c: "data_assinatura", t: "Assinatura", f: r => fmt.data(r.data_assinatura) },
          { c: "nova_vigencia_fim", t: "Nova vigência", f: r => fmt.data(r.nova_vigencia_fim) }, { c: "valor_alteracao", t: "Valor", f: r => fmt.moeda(r.valor_alteracao) }],
          data, pode ? (r, i) => `<button class="btn pq" data-i="${i}">Editar</button>` : null)}`;
      if (!pode) return;
      div.querySelector("#sAdN").onclick = async () => {
        if (await formulario({ titulo: "Registrar aditivo", sub: `Contrato ${esc(c.numero)}`, campos, novo: true,
          salvar: async v => { checar(v); const { error } = await sb().from("contrato_aditivos").insert({ contrato_id: c.id, ...v }); if (error) throw error; } })) recarregar();
      };
      div.querySelectorAll("[data-i]").forEach(b => b.onclick = async () => {
        const a = data[+b.dataset.i];
        if (await formulario({ titulo: `Editar ${a.numero}`, sub: `Contrato ${esc(c.numero)}`, campos, valores: a,
          salvar: async v => { checar(v); const { error } = await sb().from("contrato_aditivos").update(v).eq("id", a.id); if (error) throw error; } })) recarregar();
      });
    },

    async fiscais(c, div, recarregar) {
      const { data, error } = await sb().from("v_fiscais").select("*").eq("contrato_id", c.id).order("vigente", { ascending: false }).order("inicio", { ascending: false });
      if (error) throw error;
      const pode = ehAdmin() && moduloServidores();
      div.innerHTML = `<div class="cab"><h3>Gestor e fiscais</h3>${pode ? `<button class="btn pq" id="sFiN">Designar</button>` : ""}</div>
        ${moduloServidores() ? "" : `<div class="faixa warn">Módulo de servidores aguardando autorização da gerência.</div>`}
        ${miniTabela([{ c: "papel", t: "Papel" }, { c: "servidor", t: "Servidor" }, { c: "portaria", t: "Portaria" },
          { c: "inicio", t: "Período", html: r => `${fmt.data(r.inicio)} a ${r.fim ? fmt.data(r.fim) : "<span class='selo ok'>atual</span>"}` }], data,
          pode ? (r, i) => r.vigente ? `<button class="btn pq" data-enc="${i}">Encerrar</button>` : "" : null)}`;
      if (!pode) return;
      div.querySelector("#sFiN").onclick = async () => {
        const campos = [
          { c: "papel", t: "Papel", tipo: "opcoes", opcoes: ["Gestor", "Fiscal técnico", "Fiscal administrativo", "Fiscal titular", "Fiscal suplente"], obrig: true },
          { c: "servidor_id", t: "Servidor", tipo: "ref", ref: "servidores", obrig: true, largo: true },
          { c: "portaria", t: "Portaria de designação" }, { c: "inicio", t: "Início", tipo: "data", obrig: true }];
        if (await formulario({ titulo: "Designar gestor ou fiscal", sub: `Contrato ${esc(c.numero)}`, campos, novo: true, valores: { inicio: new Date().toISOString().slice(0, 10) }, opcoes: await opcoesPara(campos),
          salvar: async v => { const { error } = await sb().from("contrato_fiscais").insert({ contrato_id: c.id, ...v }); if (error) throw error; } })) recarregar();
      };
      div.querySelectorAll("[data-enc]").forEach(b => b.onclick = async () => {
        const r = data[+b.dataset.enc];
        if (await formulario({ titulo: "Encerrar designação", sub: `${esc(r.servidor)} · ${esc(r.papel)}`, campos: [{ c: "fim", t: "Último dia", tipo: "data", obrig: true }],
          valores: { fim: new Date().toISOString().slice(0, 10) },
          salvar: async v => { const { error } = await sb().from("contrato_fiscais").update({ fim: v.fim }).eq("id", r.id); if (error) throw error; } })) recarregar();
      });
    },

    async vinculos_servidor(s, div) {
      const [{ data: resp }, { data: fis }] = await Promise.all([
        sb().from("v_responsaveis").select("*").eq("servidor_id", s.id).order("inicio", { ascending: false }),
        sb().from("v_fiscais").select("*").eq("servidor_id", s.id).order("inicio", { ascending: false })]);
      const per = r => `${fmt.data(r.inicio)} a ${r.fim ? fmt.data(r.fim) : "<span class='selo ok'>atual</span>"}`;
      div.innerHTML = `<div class="cab"><h3>Responsabilidades</h3></div>${miniTabela([{ c: "entidade", t: "Entidade" }, { c: "funcao", t: "Função" }, { c: "inicio", t: "Período", html: per }], resp || [])}
        <div class="cab"><h3>Contratos que fiscaliza ou gere</h3></div>${miniTabela([{ c: "contrato", t: "Contrato" }, { c: "papel", t: "Papel" }, { c: "inicio", t: "Período", html: per }], fis || [])}`;
    }
  };

  // ---------------------------------------------------------------------
  // Histórico (auditoria)
  // ---------------------------------------------------------------------
  const NOMES_TABELA = { entidades: "Entidade", dados_escola: "Dados da escola", matriculas_anuais: "Matrículas", ambientes: "Ambiente", materiais: "Material",
    fornecedores: "Fornecedor", contratos: "Contrato", contrato_aditivos: "Aditivo", servidores: "Servidor", entidade_responsaveis: "Responsável",
    contrato_fiscais: "Fiscal", configuracao: "Configuração", gres: "GRE", municipios: "Município", tipologias: "Tipologia", territorios: "Território",
    zonas: "Zona", tipos_ambiente: "Tipo de ambiente", funcoes_responsavel: "Função", classes_material: "Classe de material" };
  const OPER = { inclusao: "incluiu", alteracao: "alterou", exclusao: "excluiu" };
  // Rótulos dos campos e campos de lista, a partir das definições dos cadastros
  const ROTULOS = { ativo: "Ativo", motivo_inativacao: "Motivo da inativação", fim: "Fim", inicio: "Início", servidor_id: "Servidor", funcao_id: "Função",
    contrato_id: "Contrato", entidade_id: "Entidade", nova_vigencia_fim: "Nova vigência", valor_alteracao: "Valor do aditivo", tipo: "Tipo", numero: "Número",
    salas_aula: "Salas de aula", ano: "Ano", quantidade: "Matrículas", fonte: "Fonte", papel: "Papel", portaria: "Portaria",
    modulo_servidores_ativo: "Módulo de servidores ativo", modulo_servidores_autorizacao: "Autorização do módulo", carga_inicial_concluida: "Carga inicial concluída",
    eh_escola: "É escola", prefixo: "Prefixo", codigo: "Código", nome: "Nome", uf: "UF" };
  const CAMPOS_LISTA = { funcao_id: "funcoes_responsavel" };
  Object.values(CADASTROS).forEach(d => d.campos.forEach(f => { if (!ROTULOS[f.c] || f.c.endsWith("_id")) ROTULOS[f.c] = f.t; if (f.tipo === "lista") CAMPOS_LISTA[f.c] = f.lista; }));

  function valorHist(c, v) {
    if (v === null || v === undefined || v === "") return "vazio";
    if (typeof v === "boolean") return fmt.simnao(v);
    if (CAMPOS_LISTA[c] && cacheOpcoes[CAMPOS_LISTA[c]]) { const o = cacheOpcoes[CAMPOS_LISTA[c]].find(x => String(x.v) === String(v)); if (o) return o.r; }
    if (c === "cnpj") return fmt.cnpj(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return fmt.data(v);
    return String(v);
  }

  function linhaHist(h, mostrarRegistro) {
    const quem = h.usuario_nome || (h.origem === "interface" ? "usuário" : h.origem);
    let det = "";
    if (h.operacao === "alteracao" && h.campos) {
      det = h.campos.map(c => `<div><b>${esc(ROTULOS[c] || c)}</b>: <del>${esc(valorHist(c, h.antes?.[c]))}</del> → <ins>${esc(valorHist(c, h.depois?.[c]))}</ins></div>`).join("");
    }
    return `<div class="h"><div class="q">${fmt.dataHora(h.em)} · ${esc(quem)}${h.origem && h.origem !== "interface" ? ` <span class="selo gray">${esc(h.origem)}</span>` : ""}</div>
      <div class="m">${OPER[h.operacao] || h.operacao} ${esc(NOMES_TABELA[h.tabela] || h.tabela)}${mostrarRegistro || h.pai ? ` <span class="cod">${esc(h.registro)}</span>` : ""}</div>${det}</div>`;
  }

  // Carrega as listas citadas nas alterações para mostrar nomes em vez de números
  async function prepararListas(hist) {
    const listas = new Set();
    hist.forEach(h => (h.campos || []).forEach(c => { if (CAMPOS_LISTA[c]) listas.add(CAMPOS_LISTA[c]); }));
    for (const l of listas) await opcoesDe({ tipo: "lista", lista: l });
  }

  async function historico(tabela, pk, caixa) {
    const { data, error } = await sb().from("auditoria").select("*")
      .or(`and(tabela.eq.${tabela},registro.eq.${pk}),pai.eq.${pk}`).order("em", { ascending: false }).limit(200);
    if (error) { caixa.innerHTML = `<div class="faixa warn">${esc(erroBanco(error))}</div>`; return; }
    await prepararListas(data);
    caixa.innerHTML = data.length ? data.map(h => linhaHist(h)).join("") : `<div class="vazio">Sem registros.</div>`;
  }

  // ---------------------------------------------------------------------
  // Início
  // ---------------------------------------------------------------------
  async function telaInicio() {
    const tela = $("tela");
    tela.innerHTML = `<div class="cab"><div><h2>Início</h2><div class="d">Situação da base de cadastros e o que precisa de atenção.</div></div></div><div class="carregando">Carregando...</div>`;
    const { data: q, error } = await sb().rpc("qualidade_cadastros");
    if (error) { tela.querySelector(".carregando").textContent = erroBanco(error); return; }
    const k = (v, l, h) => `<div class="kpi" data-ir="${h}"><div class="v">${fmt.num(v)}</div><div class="l">${l}</div></div>`;
    const pend = q.pendencias.filter(p => p.ids.length);
    const rotaPend = { escola_sem_inep: "entidades", sem_municipio: "entidades", sem_gre: "entidades", sem_cnpj: "entidades", cnpj_repetido: "entidades",
      sem_endereco: "entidades", sem_plus_code: "entidades", sem_matricula: "entidades", sem_ambientes: "entidades", salas_divergentes: "entidades", sem_responsavel: "entidades" };
    tela.innerHTML = `<div class="cab"><div><h2>Início</h2><div class="d">Situação da base de cadastros e o que precisa de atenção.</div></div></div>
      ${A().config.carga_inicial_concluida ? "" : `<div class="faixa info"><b>Fase de carga inicial.</b> A planilha BASE - CADASTROS ainda pode ser reenviada ao banco pelo Apps Script. Quando a conferência terminar, um gestor marca a carga como concluída em Configurações e, a partir daí, os cadastros passam a ser feitos só aqui.</div>`}
      <div class="kpis">${k(q.entidades, "Entidades ativas", "entidades")}${k(q.escolas, "Escolas", "entidades")}${k(q.ambientes, "Ambientes", "ambientes")}${k(q.materiais, "Materiais", "materiais")}${k(q.fornecedores, "Fornecedores", "fornecedores")}${k(q.contratos_vigentes, "Contratos vigentes", "contratos")}</div>
      <div class="grid2">
        <div class="card"><h3 style="margin-top:0">Pendências de preenchimento</h3>${pend.length ? pend.map(p =>
          `<div class="pend"><span>${esc(p.rotulo)}</span><button class="btn pq" data-p="${esc(p.chave)}">${fmt.num(p.ids.length)}</button></div>`).join("") : `<div class="vazio">Nenhuma pendência.</div>`}</div>
        <div class="card"><h3 style="margin-top:0">Contratos que vencem em até 90 dias</h3>${q.contratos_a_vencer.length ? q.contratos_a_vencer.map(c =>
          `<div class="pend"><span><b>${esc(c.numero)}</b> · ${esc(c.fornecedor)}<br><small>vence em ${fmt.data(c.vigencia_atual)}</small></span><button class="btn pq" data-c="${esc(c.id)}">${c.dias} dias</button></div>`).join("") : `<div class="vazio">Nenhum contrato vencendo.</div>`}</div>
      </div>`;
    tela.querySelectorAll("[data-ir]").forEach(e => e.onclick = () => window.APP.navegar(e.dataset.ir));
    tela.querySelectorAll("[data-p]").forEach(b => b.onclick = () => {
      const p = pend.find(x => x.chave === b.dataset.p);
      window.APP.navegar(`${rotaPend[p.chave]}?ids=${encodeURIComponent(p.ids.join(","))}&rot=${encodeURIComponent(p.rotulo)}`);
    });
    tela.querySelectorAll("[data-c]").forEach(b => b.onclick = () => window.APP.navegar(`contratos?abrir=${encodeURIComponent(b.dataset.c)}`));
  }

  // ---------------------------------------------------------------------
  // Listas controladas
  // ---------------------------------------------------------------------
  async function telaListas(params) {
    const tela = $("tela");
    const atual = params.lista && LISTAS[params.lista] ? params.lista : "gres";
    const L = LISTAS[atual];
    const pode = ehAdmin();
    tela.innerHTML = `<div class="cab"><div><h2>Listas</h2><div class="d">Valores usados nos cadastros. Renomear um valor corrige todos os registros que o usam. Valores não são apagados: são inativados e deixam de aparecer nas opções.</div></div>
      <div class="acoes">${pode ? `<button class="btn pri" id="bNovoL">Novo valor</button>` : ""}</div></div>
      <div class="abas">${Object.keys(LISTAS).map(k => `<button class="aba ${k === atual ? "on" : ""}" data-l="${k}">${esc(LISTAS[k].titulo)}</button>`).join("")}</div>
      <div id="lCorpo" class="carregando">Carregando...</div>`;
    tela.querySelectorAll("[data-l]").forEach(b => b.onclick = () => window.APP.navegar("listas?lista=" + b.dataset.l));
    const dados = await carregarTodos(atual, "*", q => q.order(L.ordem));
    const cols = [...L.campos.filter(c => c.tipo !== "bool").map(c => ({ c: c.c, t: c.t })), ...L.campos.filter(c => c.tipo === "bool").map(c => ({ c: c.c, t: "É escola", f: r => fmt.simnao(r[c.c]) })),
      { c: "ativo", t: "Situação", html: r => r.ativo ? `<span class="selo ok">Ativo</span>` : `<span class="selo gray">Inativo</span>` }];
    $("lCorpo").className = "";
    $("lCorpo").innerHTML = miniTabela(cols, dados, pode ? (r, i) => `<button class="btn pq" data-e="${i}">Editar</button> <button class="btn pq" data-a="${i}">${r.ativo ? "Inativar" : "Reativar"}</button>` : null);
    const salvo = () => { limparCache(atual); telaListas(params); };
    if (!pode) return;
    $("bNovoL").onclick = async () => {
      if (await formulario({ titulo: `Novo valor em ${L.titulo}`, campos: L.campos, novo: true, valores: atual === "municipios" ? { uf: "PI" } : atual === "tipologias" ? { eh_escola: true } : {},
        salvar: async v => { const { error } = await sb().from(atual).insert(v); if (error) throw error; } })) salvo();
    };
    $("lCorpo").querySelectorAll("[data-e]").forEach(b => b.onclick = async () => {
      const r = dados[+b.dataset.e];
      if (await formulario({ titulo: `Editar valor`, sub: "A mudança vale para todos os registros que usam este valor.", campos: L.campos, valores: r,
        salvar: async v => { const { error } = await sb().from(atual).update(v).eq("id", r.id); if (error) throw error; } })) salvo();
    });
    $("lCorpo").querySelectorAll("[data-a]").forEach(b => b.onclick = async () => {
      const r = dados[+b.dataset.a];
      if (!await confirmar({ titulo: r.ativo ? "Inativar valor?" : "Reativar valor?", texto: r.ativo ? "Os registros que já usam este valor continuam com ele; só deixa de aparecer como opção." : "" })) return;
      const { error } = await sb().from(atual).update({ ativo: !r.ativo }).eq("id", r.id);
      if (error) return aviso(erroBanco(error), true);
      salvo();
    });
  }

  // ---------------------------------------------------------------------
  // Auditoria geral
  // ---------------------------------------------------------------------
  async function telaAuditoria() {
    const tela = $("tela");
    tela.innerHTML = `<div class="cab"><div><h2>Auditoria</h2><div class="d">Últimas 300 alterações em todos os cadastros, com autor, data e valores antes e depois.</div></div></div>
      <div class="filtros"><div><label>Cadastro</label><select id="aTab"><option value="">Todos</option>${Object.keys(NOMES_TABELA).map(t => `<option value="${t}">${esc(NOMES_TABELA[t])}</option>`).join("")}</select></div>
      <div><label>Registro</label><input id="aReg" placeholder="Código (ex.: E00001)"></div></div>
      <div class="card hist" id="aLista"><div class="carregando">Carregando...</div></div>`;
    const carregar = async () => {
      let q = sb().from("auditoria").select("*").order("em", { ascending: false }).limit(300);
      if ($("aTab").value) q = q.eq("tabela", $("aTab").value);
      const reg = $("aReg").value.trim().toUpperCase();
      if (reg) q = q.or(`registro.eq.${reg},pai.eq.${reg}`);
      const { data, error } = await q;
      if (!error) await prepararListas(data);
      $("aLista").innerHTML = error ? esc(erroBanco(error)) : data.length ? data.map(h => linhaHist(h, true)).join("") : `<div class="vazio">Nenhuma alteração.</div>`;
    };
    $("aTab").onchange = carregar;
    let t; $("aReg").oninput = () => { clearTimeout(t); t = setTimeout(carregar, 400); };
    carregar();
  }

  // ---------------------------------------------------------------------
  // Usuários (só gestores)
  // ---------------------------------------------------------------------
  const PERFIS = { admin: "Gestor dos cadastros", tecnico: "Técnico GMAP" };
  const SIT = { pendente: "warn", aprovado: "ok", recusado: "bad", bloqueado: "gray" };
  async function telaUsuarios() {
    const tela = $("tela");
    tela.innerHTML = `<div class="cab"><div><h2>Usuários</h2><div class="d"><b>Gestor dos cadastros</b>: edita tudo, aprova usuários e muda configurações. <b>Técnico GMAP</b>: consulta tudo e cadastra ambientes.</div></div></div><div id="uLista" class="carregando">Carregando...</div>`;
    const { data, error } = await sb().rpc("listar_usuarios");
    if (error) { $("uLista").textContent = erroBanco(error); return; }
    $("uLista").className = "";
    $("uLista").innerHTML = miniTabela([{ c: "nome", t: "Nome" }, { c: "email", t: "E-mail" }, { c: "perfil", t: "Perfil", f: r => PERFIS[r.perfil] },
      { c: "situacao", t: "Situação", html: r => `<span class="selo ${SIT[r.situacao]}">${esc(r.situacao)}</span>` },
      { c: "ultimo_acesso", t: "Último acesso", f: r => fmt.dataHora(r.ultimo_acesso) }], data, (r, i) => r.user_id === A().uid ? "<small>você</small>" :
      r.situacao === "pendente" ? `<button class="btn pq pri" data-ap="${i}">Aprovar</button> <button class="btn pq" data-ac="recusar" data-i="${i}">Recusar</button>`
      : r.situacao === "aprovado" ? `<button class="btn pq" data-ap="${i}">Mudar perfil</button> <button class="btn pq" data-ac="bloquear" data-i="${i}">Bloquear</button>`
      : `<button class="btn pq" data-ac="reativar" data-i="${i}">Reativar</button>`);
    const decidir = async (u, acao, perfil) => {
      const { error } = await sb().rpc("decidir_usuario", { p_usuario: u.user_id, p_acao: acao, p_perfil: perfil || null });
      if (error) return aviso(erroBanco(error), true);
      aviso("Acesso atualizado."); telaUsuarios();
    };
    $("uLista").querySelectorAll("[data-ap]").forEach(b => b.onclick = async () => {
      const u = data[+b.dataset.ap];
      let perfil;
      const ok = await formulario({ titulo: u.situacao === "pendente" ? "Aprovar acesso" : "Mudar perfil", sub: `${esc(u.nome || "")} · ${esc(u.email)}`,
        campos: [{ c: "perfil", t: "Perfil", tipo: "opcoes", opcoes: Object.values(PERFIS), obrig: true }], valores: { perfil: PERFIS[u.perfil] },
        salvar: async v => { perfil = Object.keys(PERFIS).find(k => PERFIS[k] === v.perfil); } });
      if (ok) decidir(u, u.situacao === "pendente" ? "aprovar" : "mudar perfil", perfil);
    });
    $("uLista").querySelectorAll("[data-ac]").forEach(b => b.onclick = async () => {
      const u = data[+b.dataset.i];
      if (await confirmar({ titulo: `${b.dataset.ac[0].toUpperCase() + b.dataset.ac.slice(1)} acesso?`, texto: esc(u.email), perigo: b.dataset.ac !== "reativar" })) decidir(u, b.dataset.ac);
    });
  }

  // ---------------------------------------------------------------------
  // Configurações (só gestores)
  // ---------------------------------------------------------------------
  async function telaConfiguracoes() {
    const tela = $("tela");
    const c = A().config;
    tela.innerHTML = `<div class="cab"><div><h2>Configurações</h2><div class="d">Mudanças aqui ficam registradas na auditoria.</div></div></div>
      <div class="card"><h3 style="margin-top:0">Módulo de servidores</h3>
        <p>Cadastro de servidores (nome, cargo e telefone), responsáveis pelas entidades e fiscais de contrato.
        Por envolver dados pessoais, só é liberado com autorização da gerência.</p>
        <p>Situação: ${c.modulo_servidores_ativo ? `<span class="selo ok">Ativo</span>` : `<span class="selo warn">Aguardando autorização</span>`}
        ${c.modulo_servidores_autorizacao ? `<br><small>Autorização registrada: ${esc(c.modulo_servidores_autorizacao)}</small>` : ""}</p>
        <button class="btn ${c.modulo_servidores_ativo ? "" : "pri"}" id="cMod">${c.modulo_servidores_ativo ? "Desativar módulo" : "Ativar módulo"}</button></div>
      <div class="card"><h3 style="margin-top:0">Carga inicial da planilha</h3>
        ${c.carga_inicial_concluida
          ? `<p><span class="selo ok">Concluída</span> A planilha BASE - CADASTROS é só espelho: o Apps Script a reescreve a partir do banco. Cadastros e correções são feitos aqui.</p>`
          : `<p><span class="selo warn">Em andamento</span> Enquanto a carga não for concluída, a planilha pode ser reenviada ao banco pelo Apps Script, sobrescrevendo as entidades e materiais com o mesmo código.</p>
             <p>Conclua quando a conferência dos dados importados terminar. <b>Não há volta</b>: depois disso, a planilha deixa de ser fonte.</p>
             <button class="btn pri" id="cCarga">Concluir carga inicial</button>`}</div>`;
    $("cMod").onclick = async () => {
      if (c.modulo_servidores_ativo) {
        const motivo = await confirmar({ titulo: "Desativar módulo de servidores?", texto: "Os dados já cadastrados continuam guardados e visíveis, mas ninguém poderá incluir ou alterar até nova ativação.", botao: "Desativar", perigo: true, campoMotivo: "Motivo" });
        if (!motivo) return;
        const { error } = await sb().rpc("definir_modulo_servidores", { p_ativo: false, p_autorizacao: "Desativado: " + motivo });
        if (error) return aviso(erroBanco(error), true);
      } else {
        const ok = await formulario({ titulo: "Ativar módulo de servidores", sub: "Informe onde está registrada a autorização da gerência. A referência fica gravada na auditoria.",
          campos: [{ c: "ref", t: "Referência da autorização", obrig: true, largo: true, aj: "Ex.: Processo SEI 00012.000123/2026-45, Memorando 15/2026 ou e-mail da gerente de 20/11/2026",
                     valida: v => v.length >= 5 ? null : "escreva pelo menos 5 caracteres." }],
          botao: "Ativar", salvar: async v => { const { error } = await sb().rpc("definir_modulo_servidores", { p_ativo: true, p_autorizacao: v.ref }); if (error) throw error; } });
        if (!ok) return;
      }
      await window.APP.recarregarConfig(); aviso("Configuração atualizada."); telaConfiguracoes();
    };
    const bc = $("cCarga");
    if (bc) bc.onclick = async () => {
      if (!await confirmar({ titulo: "Concluir carga inicial?", texto: "A partir de agora a planilha não poderá mais ser enviada ao banco. O Apps Script passa a só reescrever a planilha a partir dos cadastros do sistema.", botao: "Concluir", perigo: true })) return;
      const { error } = await sb().rpc("concluir_carga_inicial");
      if (error) return aviso(erroBanco(error), true);
      await window.APP.recarregarConfig(); aviso("Carga inicial concluída."); telaConfiguracoes();
    };
  }

  window.TELAS = { telaLista, telaInicio, telaListas, telaAuditoria, telaUsuarios, telaConfiguracoes, abrirDetalhe, limparCache };
})();
