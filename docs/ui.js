/* Cadastros GMAP · SEDUC-PI
   Utilitários de interface: formatação, validação, avisos, janelas e formulários.
   Não usamos confirm()/alert() do navegador: em páginas protegidas eles podem ser
   bloqueados e o botão parece "não fazer nada". */
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const semAcento = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  // ---------- Formatação ----------
  const fmt = {
    data: v => { if (!v) return ""; const [a, m, d] = String(v).slice(0, 10).split("-"); return `${d}/${m}/${a}`; },
    dataHora: v => v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "",
    moeda: v => v == null || v === "" ? "" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
    num: v => v == null || v === "" ? "" : Number(v).toLocaleString("pt-BR"),
    cnpj: v => { const d = String(v ?? "").replace(/\D/g, ""); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : (v || ""); },
    tel: v => { const d = String(v ?? "").replace(/\D/g, ""); if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3"); if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3"); return v || ""; },
    simnao: v => v ? "Sim" : "Não"
  };

  // ---------- Validação ----------
  function cnpjValido(v) {
    const d = String(v || "").replace(/\D/g, "");
    if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
    const calc = n => { const p = n === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
      const s = p.reduce((t, x, i) => t + x * +d[i], 0); const r = s % 11; return r < 2 ? 0 : 11 - r; };
    return calc(12) === +d[12] && calc(13) === +d[13];
  }

  // ---------- Avisos rápidos ----------
  function aviso(msg, erro) {
    const el = document.createElement("div");
    el.className = "aviso" + (erro ? " erro" : "");
    el.textContent = msg;
    $("avisos").appendChild(el);
    setTimeout(() => el.remove(), erro ? 7000 : 3500);
  }

  // Traduz erros do banco para mensagens compreensíveis.
  const RESTRICOES = {
    entidades_inep_key: "Já existe outra entidade com este INEP.",
    entidades_motivo_inativacao: "Informe o motivo da inativação (mínimo de 5 caracteres).",
    ambientes_motivo_inativacao: "Informe o motivo da inativação (mínimo de 5 caracteres).",
    materiais_motivo_inativacao: "Informe o motivo da inativação (mínimo de 5 caracteres).",
    fornecedores_motivo_inativacao: "Informe o motivo da inativação (mínimo de 5 caracteres).",
    contratos_motivo_inativacao: "Informe o motivo da inativação (mínimo de 5 caracteres).",
    servidores_motivo_inativacao: "Informe o motivo da inativação (mínimo de 5 caracteres).",
    ambientes_identificacao_uq: "Já existe um ambiente ativo com esta identificação nesta entidade.",
    materiais_descricao_uq: "Já existe um material com esta descrição.",
    materiais_tombos_composto: "Material composto deve ter pelo menos 2 tombos (ou deixe vazio se for variável).",
    fornecedores_cnpj_key: "Já existe um fornecedor com este CNPJ.",
    contratos_numero_uq: "Já existe um contrato com este número.",
    contratos_vigencia: "O fim da vigência não pode ser anterior ao início.",
    aditivos_numero_uq: "Este contrato já tem um aditivo com este número.",
    aditivos_prazo: "Aditivo de prazo exige a nova data de fim da vigência.",
    aditivos_valor: "Aditivo de valor exige o valor do acréscimo ou supressão.",
    responsaveis_vigente_uq: "Já existe um responsável vigente nesta função. Use \"Trocar responsável\".",
    responsaveis_periodo: "A data de fim não pode ser anterior ao início.",
    fiscais_vigente_uq: "Este servidor já está designado neste papel para o contrato.",
    fiscais_periodo: "A data de fim não pode ser anterior ao início.",
    matriculas_anuais_entidade_id_ano_key: "Já existe registro de matrícula desta escola neste ano. Edite o registro existente.",
    entidades_cnpj_check: "CNPJ inválido.",
    fornecedores_cnpj_check: "CNPJ inválido.",
    servidores_telefone_check: "Telefone inválido: informe DDD e número (10 ou 11 dígitos).",
    fornecedores_email_check: "E-mail inválido.",
    entidades_inep_check: "O INEP deve ter 8 dígitos."
  };
  function erroBanco(e) {
    if (!e) return "Erro desconhecido.";
    const m = String(e.message || e);
    for (const k in RESTRICOES) if (m.includes(k)) return RESTRICOES[k];
    if (e.code === "42501" || /row-level security|permission denied/i.test(m)) return "Você não tem permissão para esta ação.";
    if (e.code === "23505") return "Já existe um registro com estes dados.";
    if (e.code === "23503") return "Referência inválida: o registro relacionado não existe.";
    if (e.code === "23514") return "Algum valor não atende às regras do cadastro.";
    if (/Failed to fetch|NetworkError/i.test(m)) return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
    return m;
  }

  // ---------- Janelas ----------
  function abrirJanela(html) {
    $("dlgp").innerHTML = html;
    $("dlg").classList.add("on");
    return $("dlgp");
  }
  function fecharJanela() { $("dlg").classList.remove("on"); $("dlgp").innerHTML = ""; }
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if ($("dlg").classList.contains("on")) { const b = $("dlgp").querySelector("[data-cancelar]"); if (b) b.click(); }
    else if ($("gaveta").classList.contains("on")) window.UI.fecharDetalhe();
  });

  function confirmar({ titulo, texto, botao, perigo, campoMotivo }) {
    return new Promise(res => {
      const p = abrirJanela(`<h2>${esc(titulo)}</h2>${texto ? `<div class="sub">${texto}</div>` : ""}
        ${campoMotivo ? `<div class="form"><label class="largo"><span class="obr">${esc(campoMotivo)}</span><textarea id="cfMot" maxlength="500"></textarea></label></div><div id="cfErr"></div>` : ""}
        <div class="dlgb"><button type="button" class="btn" data-cancelar>Voltar</button>
        <button type="button" class="btn ${perigo ? "no" : "pri"}" id="cfOk">${esc(botao || "Confirmar")}</button></div>`);
      p.querySelector("[data-cancelar]").onclick = () => { fecharJanela(); res(null); };
      p.querySelector("#cfOk").onclick = () => {
        if (campoMotivo) {
          const v = p.querySelector("#cfMot").value.trim();
          if (v.length < 5) { p.querySelector("#cfMot").classList.add("invalido"); p.querySelector("#cfErr").innerHTML = `<div class="erros">Escreva pelo menos 5 caracteres.</div>`; return; }
          fecharJanela(); res(v); return;
        }
        fecharJanela(); res(true);
      };
      setTimeout(() => (p.querySelector("#cfMot") || p.querySelector("#cfOk")).focus(), 30);
    });
  }

  // ---------- Formulário genérico ----------
  // campo: { c, t, tipo, obrig, aj, largo, opcoes, lista, ref, valida, soCriar, max }
  // opcoesCarregadas: { [c]: [{v, r, ativo}] }
  function htmlCampo(f, valor, novo, opcoes) {
    const id = "f_" + f.c;
    const dis = (f.soCriar && !novo) || f.leitura ? "disabled" : "";
    const rot = `<span class="${f.obrig ? "obr" : ""}">${esc(f.t)}</span>`;
    const aj = f.aj ? `<span class="aj">${esc(f.aj)}</span>` : "";
    const cls = f.largo || f.tipo === "area" ? "largo" : "";
    const v = valor == null ? "" : (f.formatar ? f.formatar(valor) : valor);
    switch (f.tipo) {
      case "area": return `<label class="${cls}">${rot}<textarea id="${id}" maxlength="${f.max || 2000}" ${dis}>${esc(v)}</textarea>${aj}</label>`;
      case "bool": return `<label class="chk ${cls}"><input type="checkbox" id="${id}" ${v ? "checked" : ""} ${dis}><span>${esc(f.t)}</span></label>`;
      case "numero": return `<label class="${cls}">${rot}<input type="number" id="${id}" value="${esc(v)}" min="${f.min ?? 0}" step="1" ${dis}>${aj}</label>`;
      case "moeda": return `<label class="${cls}">${rot}<input type="number" id="${id}" value="${esc(v)}" step="0.01" ${dis}>${aj}</label>`;
      case "data": return `<label class="${cls}">${rot}<input type="date" id="${id}" value="${esc(String(v).slice(0, 10))}" ${dis}>${aj}</label>`;
      case "opcoes": return `<label class="${cls}">${rot}<select id="${id}" ${dis}><option value="">Selecione</option>${f.opcoes.map(o => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>${aj}</label>`;
      case "lista": {
        const ops = (opcoes[f.c] || []).filter(o => o.ativo !== false || String(o.v) === String(v));
        return `<label class="${cls}">${rot}<select id="${id}" ${dis}><option value="">Selecione</option>${ops.map(o => `<option value="${esc(o.v)}" ${String(o.v) === String(v) ? "selected" : ""}>${esc(o.r)}${o.ativo === false ? " (inativo)" : ""}</option>`).join("")}</select>${aj}</label>`;
      }
      case "ref": {
        const ops = opcoes[f.c] || [];
        const atual = ops.find(o => String(o.v) === String(v));
        return `<label class="${cls}">${rot}<input id="${id}" list="${id}_l" value="${esc(atual ? atual.r : v)}" placeholder="Digite para buscar" autocomplete="off" ${dis}>
          <datalist id="${id}_l">${ops.filter(o => o.ativo !== false).map(o => `<option value="${esc(o.r)}"></option>`).join("")}</datalist>${aj}</label>`;
      }
      default: return `<label class="${cls}">${rot}<input type="text" id="${id}" value="${esc(v)}" maxlength="${f.max || 300}" ${dis}>${aj}</label>`;
    }
  }

  function lerCampo(f, p, opcoes) {
    const el = p.querySelector("#f_" + f.c);
    if (!el) return undefined;
    if (f.tipo === "bool") return el.checked;
    const s = el.value.trim();
    if (s === "") return null;
    if (f.tipo === "numero") return parseInt(s, 10);
    if (f.tipo === "moeda") return Number(s);
    if (f.tipo === "lista") return isNaN(+s) ? s : +s;
    if (f.tipo === "ref") {
      const o = (opcoes[f.c] || []).find(x => x.r === s || String(x.v).toUpperCase() === s.toUpperCase());
      return o ? o.v : { invalido: s };
    }
    return s;
  }

  /** Abre um formulário. salvar(dados) deve gravar e lançar erro em caso de falha. Resolve true se salvou. */
  function formulario({ titulo, sub, campos, valores, novo, opcoes, salvar, botao }) {
    valores = valores || {}; opcoes = opcoes || {};
    return new Promise(res => {
      const p = abrirJanela(`<h2>${esc(titulo)}</h2>${sub ? `<div class="sub">${sub}</div>` : ""}
        <form class="form" id="fGen" novalidate>${campos.map(f => htmlCampo(f, valores[f.c], novo, opcoes)).join("")}</form>
        <div id="fErr"></div>
        <div class="dlgb"><button type="button" class="btn" data-cancelar>Cancelar</button><button type="button" class="btn pri" id="fOk">${esc(botao || "Salvar")}</button></div>`);
      const ok = p.querySelector("#fOk");
      p.querySelector("[data-cancelar]").onclick = () => { fecharJanela(); res(false); };
      const enviar = async () => {
        p.querySelectorAll(".invalido").forEach(e => e.classList.remove("invalido"));
        const dados = {}, erros = [];
        for (const f of campos) {
          if ((f.soCriar && !novo) || f.leitura) continue;
          const v = lerCampo(f, p, opcoes);
          const el = p.querySelector("#f_" + f.c);
          if (v && typeof v === "object" && v.invalido) { erros.push(`${f.t}: "${v.invalido}" não foi encontrado. Escolha uma opção da lista.`); el.classList.add("invalido"); continue; }
          if (f.obrig && (v === null || v === undefined)) { erros.push(`${f.t}: preenchimento obrigatório.`); el.classList.add("invalido"); continue; }
          if (v !== null && f.valida) { const m = f.valida(v, dados); if (m) { erros.push(`${f.t}: ${m}`); el.classList.add("invalido"); continue; } }
          dados[f.c] = v;
        }
        if (erros.length) { p.querySelector("#fErr").innerHTML = `<div class="erros"><b>Corrija antes de salvar:</b><ul>${erros.map(e => `<li>${esc(e)}</li>`).join("")}</ul></div>`; return; }
        ok.disabled = true; ok.textContent = "Salvando...";
        try { await salvar(dados); fecharJanela(); res(true); }
        catch (e) { p.querySelector("#fErr").innerHTML = `<div class="erros">${esc(erroBanco(e))}</div>`; ok.disabled = false; ok.textContent = botao || "Salvar"; }
      };
      ok.onclick = enviar;
      p.querySelector("#fGen").addEventListener("keydown", e => { if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type !== "checkbox") { e.preventDefault(); enviar(); } });
      setTimeout(() => { const f = p.querySelector("input:not([disabled]),select:not([disabled]),textarea:not([disabled])"); if (f) f.focus(); }, 30);
    });
  }

  // ---------- Exportação CSV (abre no Excel com acentos) ----------
  function baixarCsv(nome, cabecalhos, linhas) {
    const cel = v => { const s = String(v ?? ""); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = "﻿" + [cabecalhos.map(cel).join(";"), ...linhas.map(l => l.map(cel).join(";"))].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `${nome}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  window.UI = { $, esc, semAcento, fmt, cnpjValido, aviso, erroBanco, abrirJanela, fecharJanela, confirmar, formulario, baixarCsv,
    fecharDetalhe: () => { $("gaveta").classList.remove("on"); $("detalhe").innerHTML = ""; } };
})();
