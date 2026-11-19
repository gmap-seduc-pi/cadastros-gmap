/* Cadastros GMAP · DEMONSTRAÇÃO
   Imita o Supabase dentro do navegador para testar a interface sem banco real.
   Os dados ficam só na memória: recarregar a página volta ao estado inicial.
   Reproduz as principais regras do banco (permissões por perfil, trava do módulo de
   servidores, códigos automáticos, unicidade, auditoria) para o teste ser fiel. */
(function () {
  const D = JSON.parse(JSON.stringify(window.__DADOS_DEMO));
  const USUARIOS = {
    gestor: "00000000-0000-0000-0000-00000000000a",
    tecnico: "00000000-0000-0000-0000-00000000000b"
  };
  let uid = USUARIOS.gestor;
  const hoje = () => new Date().toISOString().slice(0, 10);
  const dias = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);
  const porId = (t, id) => (D[t] || []).find(r => String(r.id) === String(id)) || {};
  const perfilAtual = () => { const p = D.perfis.find(x => x.user_id === uid); return p && p.situacao === "aprovado" ? p.perfil : null; };
  const erro = (message, code) => ({ data: null, error: { message, code } });

  // ---------- Visões (recalculadas a cada leitura, como no banco) ----------
  const VISOES = {
    v_entidades: () => D.entidades.map(e => {
      const t = porId("tipologias", e.tipologia_id), m = porId("municipios", e.municipio_id), g = porId("gres", e.gre_id);
      return { ...e, tipologia: t.nome, eh_escola: !!t.eh_escola, municipio: m.nome || null,
        nome_inep: [e.nome, e.inep, m.nome].filter(Boolean).join(" - "),
        gre: g.codigo || null, gre_rotulo: g.rotulo || null, territorio: porId("territorios", e.territorio_id).nome || null,
        zona: porId("zonas", e.zona_id).nome || null, cnpj_formatado: window.UI.fmt.cnpj(e.cnpj) || null };
    }),
    v_ambientes: () => D.ambientes.map(a => {
      const e = porId("entidades", a.entidade_id);
      return { ...a, entidade: e.nome, inep: e.inep, municipio: porId("municipios", e.municipio_id).nome, gre: porId("gres", e.gre_id).codigo, tipo: porId("tipos_ambiente", a.tipo_id).nome };
    }),
    v_materiais: () => D.materiais.map(m => { const c = porId("classes_material", m.classe_id); return { ...m, classe: c.nome, prefixo: c.prefixo }; }),
    contratos_situacao: () => D.contratos.map(c => {
      const ad = D.contrato_aditivos.filter(a => a.contrato_id === c.id);
      const vig = [c.vigencia_fim, ...ad.map(a => a.nova_vigencia_fim).filter(Boolean)].sort().pop();
      const situacao = !c.ativo ? "Inativo" : hoje() < c.vigencia_inicio ? "A iniciar" : hoje() > vig ? "Encerrado" : "Vigente";
      return { ...c, fornecedor: porId("fornecedores", c.fornecedor_id).razao_social, vigencia_atual: vig,
        valor_atual: Number(c.valor_global || 0) + ad.reduce((s, a) => s + Number(a.valor_alteracao || 0), 0),
        aditivos: ad.length, situacao, dias_para_vencer: dias(vig, hoje()) };
    }),
    v_responsaveis: () => D.entidade_responsaveis.map(r => {
      const s = porId("servidores", r.servidor_id);
      return { ...r, entidade: porId("entidades", r.entidade_id).nome, servidor: s.nome, cargo: s.cargo, telefone: s.telefone,
        funcao: porId("funcoes_responsavel", r.funcao_id).nome, vigente: !r.fim };
    }),
    v_fiscais: () => D.contrato_fiscais.map(f => {
      const s = porId("servidores", f.servidor_id);
      return { ...f, contrato: porId("contratos", f.contrato_id).numero, servidor: s.nome, cargo: s.cargo, telefone: s.telefone, vigente: !f.fim };
    })
  };
  const ler = t => VISOES[t] ? VISOES[t]() : (D[t] || []);

  // ---------- Regras de escrita ----------
  const CHAVE = { materiais: "codigo", dados_escola: "entidade_id", perfis: "user_id" };
  const PAI = { dados_escola: "entidade_id", matriculas_anuais: "entidade_id", ambientes: "entidade_id", contratos: "fornecedor_id",
                contrato_aditivos: "contrato_id", entidade_responsaveis: "entidade_id", contrato_fiscais: "contrato_id" };
  const PREFIXO = { entidades: ["E", 5], ambientes: ["A", 6], fornecedores: ["F", 5], contratos: ["C", 5], servidores: ["S", 5] };
  const MODULO = ["servidores", "entidade_responsaveis", "contrato_fiscais"];
  const UNICO = {
    entidades: [["inep", "entidades_inep_key"]],
    materiais: [["descricao", "materiais_descricao_uq"]],
    fornecedores: [["cnpj", "fornecedores_cnpj_key"]],
    contratos: [["numero", "contratos_numero_uq"]]
  };
  const INATIVAVEIS = ["entidades", "ambientes", "materiais", "fornecedores", "contratos", "servidores"];

  function podeEditar(t) {
    const p = perfilAtual();
    if (p === "admin") return true;
    return p === "tecnico" && t === "ambientes";
  }
  function proximoCodigo(t, o) {
    if (t === "materiais") {
      const pre = porId("classes_material", o.classe_id).prefixo;
      const n = Math.max(0, ...D.materiais.filter(m => m.codigo.startsWith(pre + "-")).map(m => parseInt(m.codigo.split("-")[1], 10))) + 1;
      return pre + "-" + String(n).padStart(4, "0");
    }
    if (PREFIXO[t]) {
      const [p, w] = PREFIXO[t];
      const n = Math.max(0, ...D[t].map(r => parseInt(String(r.id).slice(1), 10) || 0)) + 1;
      return p + String(n).padStart(w, "0");
    }
    return Math.max(0, ...D[t].map(r => Number(r.id) || 0)) + 1;
  }
  function validar(t, novo, antigo) {
    if (MODULO.includes(t) && !D.configuracao[0].modulo_servidores_ativo)
      return erro("O módulo de servidores aguarda a autorização da gerência. Um gestor pode ativá-lo em Configurações.", "P0001");
    if (["entidades", "fornecedores"].includes(t) && novo.cnpj) {
      novo.cnpj = String(novo.cnpj).replace(/\D/g, "");
      if (!window.UI.cnpjValido(novo.cnpj)) return erro(t + "_cnpj_check", "23514");
    }
    if (INATIVAVEIS.includes(t) && novo.ativo === false && String(novo.motivo_inativacao || "").trim().length < 5)
      return erro(t + "_motivo_inativacao", "23514");
    if (["dados_escola", "matriculas_anuais"].includes(t) && !porId("tipologias", porId("entidades", novo.entidade_id).tipologia_id).eh_escola)
      return erro("Este dado só pode ser registrado para escolas (a tipologia da entidade não é de escola).", "P0001");
    for (const [c, msg] of UNICO[t] || []) {   // msg = nome da restrição no banco
      if (novo[c] == null || novo[c] === "") continue;
      const k = CHAVE[t] || "id";
      if (D[t].some(r => r !== antigo && String(r[c]).toLowerCase() === String(novo[c]).toLowerCase() && r[k] !== novo[k]))
        return erro(`duplicate key value violates unique constraint "${msg}"`, "23505");   // mesma mensagem do PostgreSQL
    }
    if (t === "ambientes" && novo.ativo !== false && D.ambientes.some(a => a !== antigo && a.ativo && a.entidade_id === novo.entidade_id
        && a.identificacao.trim().toLowerCase() === String(novo.identificacao).trim().toLowerCase() && (a.bloco || "").toLowerCase() === (novo.bloco || "").toLowerCase()))
      return erro("ambientes_identificacao_uq", "23505");
    if (t === "matriculas_anuais" && D.matriculas_anuais.some(m => m !== antigo && m.entidade_id === novo.entidade_id && m.ano === novo.ano))
      return erro("matriculas_anuais_entidade_id_ano_key", "23505");
    if (t === "entidade_responsaveis" && !novo.fim && D.entidade_responsaveis.some(r => r !== antigo && !r.fim && r.entidade_id === novo.entidade_id && r.funcao_id === novo.funcao_id))
      return erro("responsaveis_vigente_uq", "23505");
    return null;
  }
  function auditar(t, op, antes, depois) {
    const k = CHAVE[t] || "id";
    const reg = (depois || antes)[k];
    let campos = null, a = antes, d = depois;
    if (op === "alteracao") {
      campos = Object.keys(depois).filter(c => !["atualizado_em", "atualizado_por", "criado_em"].includes(c) && JSON.stringify(antes[c]) !== JSON.stringify(depois[c]));
      if (!campos.length) return;
      a = {}; d = {}; campos.forEach(c => { a[c] = antes[c]; d[c] = depois[c]; });
    }
    const p = D.perfis.find(x => x.user_id === uid);
    D.auditoria.push({ id: D.auditoria.length + 1000, em: new Date().toISOString(), tabela: t, registro: String(reg), pai: PAI[t] ? (depois || antes)[PAI[t]] : null,
      operacao: op, campos, antes: op === "inclusao" ? null : a, depois: d, usuario_id: uid, usuario_nome: p ? p.nome : null, origem: "interface" });
  }
  function gravar(t, op, valor, filtros) {
    if (!podeEditar(t)) return erro("permission denied", "42501");
    const k = CHAVE[t] || "id";
    if (op === "insert" || op === "upsert") {
      const existente = op === "upsert" ? D[t].find(r => r[k] === valor[k]) : null;
      if (existente) return gravar(t, "update", valor, [r => r[k] === valor[k]]);
      const o = { ativo: INATIVAVEIS.includes(t) || D[t][0]?.ativo !== undefined ? true : undefined, ...valor };
      if (o.ativo === undefined) delete o.ativo;
      const e = validar(t, o, null); if (e) return e;
      if (o[k] == null) o[k] = proximoCodigo(t, o);
      o.criado_em = o.atualizado_em = new Date().toISOString();
      D[t].push(o); auditar(t, "inclusao", null, o);
      return { data: o, error: null };
    }
    const alvo = D[t].filter(r => filtros.every(f => f(r)));
    for (const r of alvo) {
      const novo = { ...r, ...valor };
      if (novo[k] !== r[k]) return erro("O código de um registro não pode ser alterado.", "P0001");
      const e = validar(t, novo, r); if (e) return e;
      const antes = { ...r }; Object.assign(r, valor, { atualizado_em: new Date().toISOString() }); auditar(t, "alteracao", antes, r);
    }
    return { data: null, error: null };
  }

  // ---------- Construtor de consultas (subconjunto do supabase-js) ----------
  class Consulta {
    constructor(t) { this.t = t; this.fs = []; this.op = "select"; this.um = false; this.talvez = false; this.ords = []; this.lim = null; this.de = 0; this.ate = null; }
    select() { return this; }
    eq(c, v) { this.fs.push(r => String(r[c]) === String(v)); return this; }
    or(expr) {
      const conds = []; const re = /and\((\w+)\.eq\.([^,]+),(\w+)\.eq\.([^)]+)\)|(\w+)\.eq\.([^,]+)/g; let m;
      while ((m = re.exec(expr))) {
        if (m[1]) { const [a, b, c, d] = [m[1], m[2], m[3], m[4]]; conds.push(r => String(r[a]) === b && String(r[c]) === d); }
        else { const [a, b] = [m[5], m[6]]; conds.push(r => String(r[a]) === b); }
      }
      this.fs.push(r => conds.some(f => f(r))); return this;
    }
    order(c, o) { this.ords.push([c, o && o.ascending === false]); return this; }
    range(a, b) { this.de = a; this.ate = b; return this; }
    limit(n) { this.lim = n; return this; }
    single() { this.um = true; return this; }
    maybeSingle() { this.um = true; this.talvez = true; return this; }
    insert(o) { this.op = "insert"; this.val = o; return this; }
    update(o) { this.op = "update"; this.val = o; return this; }
    upsert(o) { this.op = "upsert"; this.val = o; return this; }
    then(ok, falha) { return new Promise(r => setTimeout(r, 60)).then(() => this.executar()).then(ok, falha); }
    executar() {
      if (this.op !== "select") {
        const r = gravar(this.t, this.op, { ...this.val }, this.fs);
        if (r.error || this.op === "update") return r;
        return { data: this.um ? r.data : [r.data], error: null };
      }
      if (!perfilAtual() && this.t !== "perfis") return { data: this.um ? null : [], error: null };
      let rs = ler(this.t).filter(r => this.fs.every(f => f(r)));
      for (const [c, d] of [...this.ords].reverse()) rs = [...rs].sort((a, b) => {
        const x = a[c] ?? "", y = b[c] ?? "";
        const v = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR", { numeric: true });
        return d ? -v : v;
      });
      if (this.ate != null) rs = rs.slice(this.de, this.ate + 1);
      if (this.lim) rs = rs.slice(0, this.lim);
      rs = JSON.parse(JSON.stringify(rs));
      if (this.um) return rs.length || this.talvez ? { data: rs[0] || null, error: null } : erro("Registro não encontrado.");
      return { data: rs, error: null };
    }
  }

  // ---------- Funções do banco (rpc) ----------
  function qualidade() {
    const ano = new Date().getFullYear();
    const ents = VISOES.v_entidades().filter(e => e.ativo);
    const esc = ents.filter(e => e.eh_escola);
    const amb = D.ambientes.filter(a => a.ativo);
    const ids = l => l.map(e => e.id);
    const salaId = (D.tipos_ambiente.find(t => t.nome === "Sala de aula") || {}).id;
    const diretor = (D.funcoes_responsavel.find(f => f.nome === "Diretor(a)") || {}).id;
    const pend = [
      ["escola_sem_inep", "Escolas sem INEP", ids(esc.filter(e => !e.inep))],
      ["sem_municipio", "Entidades sem município", ids(ents.filter(e => !e.municipio_id))],
      ["sem_gre", "Entidades sem GRE", ids(ents.filter(e => !e.gre_id))],
      ["sem_cnpj", "Escolas sem CNPJ", ids(esc.filter(e => !e.cnpj))],
      ["cnpj_repetido", "Entidades com CNPJ repetido", ids(ents.filter(e => e.cnpj && ents.some(o => o.cnpj === e.cnpj && o.id !== e.id)))],
      ["sem_endereco", "Entidades sem endereço", ids(ents.filter(e => !e.endereco))],
      ["sem_plus_code", "Entidades sem Plus Code (localização)", ids(ents.filter(e => !e.plus_code))],
      ["sem_matricula", "Escolas sem matrícula de " + ano, ids(esc.filter(e => !D.matriculas_anuais.some(m => m.entidade_id === e.id && m.ano === ano)))],
      ["sem_ambientes", "Escolas sem ambientes cadastrados", ids(esc.filter(e => !amb.some(a => a.entidade_id === e.id)))],
      ["salas_divergentes", "Escolas com salas de aula informadas diferentes das cadastradas", D.dados_escola.filter(d => d.salas_aula != null
        && amb.some(a => a.entidade_id === d.entidade_id) && d.salas_aula !== amb.filter(a => a.entidade_id === d.entidade_id && a.tipo_id === salaId).length).map(d => d.entidade_id)],
      ["sem_responsavel", "Escolas sem diretor(a) vigente", D.configuracao[0].modulo_servidores_ativo
        ? ids(esc.filter(e => !D.entidade_responsaveis.some(r => r.entidade_id === e.id && !r.fim && r.funcao_id === diretor))) : []]
    ].map(([chave, rotulo, l]) => ({ chave, rotulo, ids: l }));
    const cs = VISOES.contratos_situacao();
    return { entidades: ents.length, escolas: esc.length, ambientes: amb.length, materiais: D.materiais.filter(m => m.ativo).length,
      fornecedores: D.fornecedores.filter(f => f.ativo).length, contratos_vigentes: cs.filter(c => c.situacao === "Vigente").length, ano, pendencias: pend,
      contratos_a_vencer: cs.filter(c => c.situacao === "Vigente" && c.dias_para_vencer <= 90).sort((a, b) => a.dias_para_vencer - b.dias_para_vencer)
        .map(c => ({ id: c.id, numero: c.numero, fornecedor: c.fornecedor, vigencia_atual: c.vigencia_atual, dias: c.dias_para_vencer })) };
  }
  function soGestor() { return perfilAtual() === "admin" ? null : erro("Acesso restrito aos gestores dos cadastros.", "P0001"); }
  const RPC = {
    qualidade_cadastros: () => ({ data: qualidade(), error: null }),
    listar_usuarios: () => soGestor() || { data: D.perfis.map(p => ({ ...p, ultimo_acesso: p.user_id === uid ? new Date().toISOString() : null })), error: null },
    decidir_usuario: a => {
      const e = soGestor(); if (e) return e;
      if (a.p_usuario === uid) return erro("Você não pode alterar o próprio acesso.", "P0001");
      const p = D.perfis.find(x => x.user_id === a.p_usuario);
      p.situacao = { recusar: "recusado", bloquear: "bloqueado" }[a.p_acao] || "aprovado";
      if (a.p_perfil) p.perfil = a.p_perfil;
      return { data: null, error: null };
    },
    definir_modulo_servidores: a => {
      const e = soGestor(); if (e) return e;
      if (a.p_ativo && String(a.p_autorizacao || "").trim().length < 5) return erro("Informe a referência da autorização da gerência (processo SEI, memorando ou e-mail).", "P0001");
      const c = D.configuracao[0], antes = { ...c };
      c.modulo_servidores_ativo = a.p_ativo; c.modulo_servidores_autorizacao = a.p_autorizacao;
      auditar("configuracao", "alteracao", antes, c);
      return { data: null, error: null };
    },
    concluir_carga_inicial: () => {
      const e = soGestor(); if (e) return e;
      const c = D.configuracao[0], antes = { ...c }; c.carga_inicial_concluida = true; auditar("configuracao", "alteracao", antes, c);
      return { data: null, error: null };
    },
    definir_responsavel: a => {
      if (!podeEditar("entidade_responsaveis")) return erro("Sem permissão para alterar responsáveis.", "P0001");
      const atual = D.entidade_responsaveis.find(r => r.entidade_id === a.p_entidade && r.funcao_id === a.p_funcao && !r.fim);
      if (atual) {
        const d = new Date(a.p_inicio); d.setDate(d.getDate() - 1);
        const fim = d.toISOString().slice(0, 10) < atual.inicio ? atual.inicio : d.toISOString().slice(0, 10);
        const r = gravar("entidade_responsaveis", "update", { fim }, [x => x === atual]); if (r.error) return r;
      }
      return gravar("entidade_responsaveis", "insert", { entidade_id: a.p_entidade, servidor_id: a.p_servidor, funcao_id: a.p_funcao, inicio: a.p_inicio, observacao: a.p_observacao || null });
    }
  };

  window.supabase = {
    createClient() {
      return {
        from: t => new Consulta(t),
        rpc: (n, a) => new Promise(r => setTimeout(r, 80)).then(() => RPC[n] ? RPC[n](a || {}) : erro("Função não simulada: " + n)),
        auth: {
          getSession: async () => ({ data: { session: { user: { id: uid } } } }),
          onAuthStateChange() {}, signOut: async () => ({}),
          signInWithPassword: async () => ({}), signUp: async () => ({}), resetPasswordForEmail: async () => ({}), updateUser: async () => ({})
        }
      };
    }
  };

  // Troca de perfil da barra da demonstração
  window.DEMO = { trocarPerfil(p) { uid = USUARIOS[p]; window.TELAS && window.TELAS.limparCache(); window.APP.reiniciar(); } };
})();
