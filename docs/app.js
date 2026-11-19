/* Cadastros GMAP · SEDUC-PI
   Acesso (login, solicitação, senha), menu e navegação entre telas. */
(function () {
  const { $, esc, aviso, erroBanco } = window.UI;
  const cfg = window.CADASTROS_CONFIG || {};

  if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("SEU-PROJETO")) {
    document.body.innerHTML = `<div class="acesso"><div class="acard"><h1>Configuração pendente</h1><div class="sub">Preencha a URL e a chave pública do Supabase em <b>docs/config.js</b>. Veja o manual de implantação.</div></div></div>`;
    return;
  }

  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  const APP = window.APP = { sb, uid: null, perfil: null, nome: "", config: {}, recarregarConfig, reiniciar: () => iniciar() };
  const TELAS_ACESSO = ["telaLogin", "telaCad", "telaEsq", "telaNova", "telaPend"];
  const mostrar = id => { TELAS_ACESSO.forEach(t => $(t).hidden = t !== id); $("app").hidden = id !== "app"; };

  // ---------- Acesso ----------
  $("aCad").onclick = e => { e.preventDefault(); mostrar("telaCad"); };
  $("aEsq").onclick = e => { e.preventDefault(); mostrar("telaEsq"); };
  document.querySelectorAll(".aVoltar").forEach(a => a.onclick = e => { e.preventDefault(); mostrar("telaLogin"); });

  function aoEnviar(form, fn) {
    const f = $(form); let ocupado = false;
    const go = async ev => { ev.preventDefault(); if (ocupado) return; ocupado = true; const b = f.querySelector("button[type=submit]"); b.disabled = true; try { await fn(); } finally { ocupado = false; b.disabled = false; } };
    f.addEventListener("submit", go);
  }

  aoEnviar("fLogin", async () => {
    $("lErr").textContent = "";
    const { error } = await sb.auth.signInWithPassword({ email: $("lEmail").value.trim(), password: $("lSenha").value });
    if (error) $("lErr").textContent = /invalid/i.test(error.message) ? "E-mail ou senha incorretos." : /confirm/i.test(error.message) ? "Confirme seu e-mail pelo link enviado antes de entrar." : erroBanco(error);
  });

  aoEnviar("fCad", async () => {
    const nome = $("cNome").value.trim(), email = $("cEmail").value.trim(), s1 = $("cS1").value, s2 = $("cS2").value;
    const err = nome.split(/\s+/).length < 2 ? "Informe o nome completo." : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? "E-mail inválido."
      : s1.length < 10 ? "A senha deve ter pelo menos 10 caracteres." : s1 !== s2 ? "As senhas não conferem." : "";
    $("cErr").textContent = err;
    if (err) return;
    const { error } = await sb.auth.signUp({ email, password: s1, options: { data: { origem: "cadastros-gmap", nome }, emailRedirectTo: location.origin + location.pathname } });
    if (error) { $("cErr").textContent = /registered/i.test(error.message) ? "Este e-mail já tem cadastro. Use \"Esqueci a senha\" se precisar." : erroBanco(error); return; }
    $("pTit").textContent = "Solicitação enviada";
    $("pMsg").innerHTML = "Se for pedido, confirme seu e-mail pelo link recebido. Depois, aguarde a aprovação de um gestor dos cadastros.";
    mostrar("telaPend");
  });

  aoEnviar("fEsq", async () => {
    const { error } = await sb.auth.resetPasswordForEmail($("eEmail").value.trim(), { redirectTo: location.origin + location.pathname });
    $("eErr").textContent = error ? erroBanco(error) : "";
    if (!error) aviso("Se o e-mail estiver cadastrado, você receberá o link em instantes.");
  });

  aoEnviar("fNova", async () => {
    const s1 = $("nS1").value, s2 = $("nS2").value;
    if (s1.length < 10 || s1 !== s2) { $("nErr").textContent = s1.length < 10 ? "A senha deve ter pelo menos 10 caracteres." : "As senhas não conferem."; return; }
    const { error } = await sb.auth.updateUser({ password: s1 });
    if (error) { $("nErr").textContent = erroBanco(error); return; }
    aviso("Senha alterada."); history.replaceState(null, "", location.pathname); iniciar();
  });

  const sair = async () => { await sb.auth.signOut(); rotaAtual = "inicio"; mostrar("telaLogin"); };
  $("pSair").onclick = sair; $("bSair").onclick = sair;

  let recuperando = false;
  sb.auth.onAuthStateChange((ev, sessao) => {
    if (ev === "PASSWORD_RECOVERY") { recuperando = true; mostrar("telaNova"); return; }
    if (ev === "SIGNED_IN" && !recuperando && sessao?.user?.id !== APP.uid) iniciar();
    if (ev === "SIGNED_OUT") { APP.uid = null; mostrar("telaLogin"); }
  });

  async function recarregarConfig() {
    const { data } = await sb.from("configuracao").select("*").eq("id", 1).maybeSingle();
    APP.config = data || {};
    montarMenu();
  }

  async function iniciar() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { mostrar("telaLogin"); return; }
    if (recuperando) return;
    APP.uid = session.user.id;
    const { data: p } = await sb.from("perfis").select("*").eq("user_id", APP.uid).maybeSingle();
    if (!p || p.situacao !== "aprovado") {
      const msg = { pendente: ["Acesso em análise", "Sua solicitação foi recebida. Aguarde a aprovação de um gestor dos cadastros."],
        recusado: ["Acesso recusado", "Sua solicitação não foi aprovada. Fale com a GMAP se achar que é um engano."],
        bloqueado: ["Acesso bloqueado", "Seu acesso foi bloqueado. Fale com a GMAP."] }[p?.situacao] || ["Sem acesso", "Esta conta não tem perfil nos Cadastros GMAP. Use \"Solicitar acesso\" ou fale com a GMAP."];
      $("pTit").textContent = msg[0]; $("pMsg").textContent = msg[1];
      mostrar("telaPend"); return;
    }
    APP.perfil = p.perfil; APP.nome = p.nome || p.email;
    $("uNome").textContent = APP.nome;
    $("uPerfil").textContent = p.perfil === "admin" ? "Gestor dos cadastros" : "Técnico GMAP";
    await recarregarConfig();
    mostrar("app");
    rotear();
  }

  // ---------- Menu e rotas ----------
  const MENU = [
    { g: null, itens: [["inicio", "Início"]] },
    { g: "Cadastros", itens: [["entidades", "Entidades"], ["ambientes", "Ambientes"], ["materiais", "Materiais"]] },
    { g: "Contratações", itens: [["fornecedores", "Fornecedores"], ["contratos", "Contratos"]] },
    { g: "Pessoas", itens: [["servidores", "Servidores"]] },
    { g: "Administração", itens: [["listas", "Listas"], ["auditoria", "Auditoria"], ["usuarios", "Usuários", true], ["configuracoes", "Configurações", true]] }
  ];
  function montarMenu() {
    const adm = APP.perfil === "admin";
    $("nav").innerHTML = MENU.map(m => `${m.g ? `<div class="grupo">${esc(m.g)}</div>` : ""}${m.itens.filter(i => !i[2] || adm).map(([r, t]) =>
      `<a href="#/${r}" data-r="${r}">${esc(t)}${r === "servidores" && !APP.config.modulo_servidores_ativo ? `<span class="tag">aguardando</span>` : ""}</a>`).join("")}`).join("");
    marcarMenu();
  }
  // Navegação: a rota atual fica guardada no próprio sistema. O endereço (#/rota) é
  // atualizado quando o navegador permite, para o botão Voltar e os favoritos
  // funcionarem, mas a troca de tela não depende disso (em molduras isoladas, como a
  // visualização da demonstração, o navegador bloqueia a mudança de endereço).
  let rotaAtual = location.hash.slice(2) || "inicio";
  function navegar(rota) {
    rotaAtual = String(rota || "inicio").replace(/^#?\/?/, "");
    try { if (location.hash !== "#/" + rotaAtual) history.pushState(null, "", "#/" + rotaAtual); } catch (e) { /* endereço bloqueado: segue só pela rota interna */ }
    rotear();
  }
  APP.navegar = navegar;
  document.addEventListener("click", e => {
    const a = e.target.closest('a[href^="#/"]');
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;   // Ctrl+clique continua abrindo em nova aba
    e.preventDefault();
    navegar(a.getAttribute("href").slice(2));
  });
  const aoMudarEndereco = () => { const h = location.hash.slice(2); if (h && h !== rotaAtual) { rotaAtual = h; rotear(); } };
  window.addEventListener("hashchange", aoMudarEndereco);
  window.addEventListener("popstate", aoMudarEndereco);

  function marcarMenu() {
    const r = rotaAtual.split("?")[0] || "inicio";
    document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("on", a.dataset.r === r));
  }
  $("bMenu").onclick = () => $("nav").classList.toggle("aberta");
  $("nav").addEventListener("click", () => $("nav").classList.remove("aberta"));

  function rotear() {
    if (!APP.perfil) return;
    window.UI.fecharDetalhe();
    const [rota, qs] = rotaAtual.split("?");
    const params = Object.fromEntries(new URLSearchParams(qs || ""));
    marcarMenu();
    const T = window.TELAS;
    const adm = APP.perfil === "admin";
    try {
      if (window.CAD.CADASTROS[rota]) return T.telaLista(rota, params);
      if (rota === "listas") return T.telaListas(params);
      if (rota === "auditoria") return T.telaAuditoria();
      if (rota === "usuarios" && adm) return T.telaUsuarios();
      if (rota === "configuracoes" && adm) return T.telaConfiguracoes();
      return T.telaInicio();
    } catch (e) { aviso(erroBanco(e), true); }
  }
  $("gaveta").addEventListener("click", e => { if (e.target.id === "gaveta") window.UI.fecharDetalhe(); });
  window.addEventListener("unhandledrejection", e => aviso(erroBanco(e.reason), true));

  iniciar();
})();
