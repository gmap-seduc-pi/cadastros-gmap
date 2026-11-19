#!/usr/bin/env python3
"""Gera demo/demonstracao.html: a interface real (docs/) com o banco simulado e dados
fictícios, tudo em um arquivo só, para testar antes de implantar.
Uso: python3 demo/gerar_demo.py"""
import base64, json, pathlib, re

raiz = pathlib.Path(__file__).resolve().parent.parent
docs, demo = raiz / "docs", raiz / "demo"
ler = lambda p: p.read_text(encoding="utf-8")

html = ler(docs / "index.html")
logo = "data:image/png;base64," + base64.b64encode((docs / "assets/logo-seduc.png").read_bytes()).decode()
html = html.replace('src="assets/logo-seduc.png"', 'data-logo').replace('href="assets/logo-seduc.png"', 'data-logo-icone')
html = html.replace("<title>Cadastros GMAP · SEDUC-PI</title>", "<title>Cadastros GMAP · DEMONSTRAÇÃO</title>")

css = ler(docs / "style.css") + """
.demo{position:fixed;left:12px;bottom:12px;z-index:90;background:#231F20;color:#fff;border-radius:10px;padding:10px 12px;font-size:12px;
  display:flex;gap:10px;align-items:center;flex-wrap:wrap;max-width:min(560px,calc(100vw - 24px));box-shadow:0 4px 14px rgba(0,0,0,.25)}
.demo b{color:#FDB913}
.demo select{border-radius:6px;padding:4px 6px;border:0;font-size:12px;color:#231F20;background:#fff}
"""
html = re.sub(r'<link rel="stylesheet" href="style.css[^"]*">', lambda m: "<style>\n" + css + "\n</style>", html)

barra = """<div class="demo" role="note"><b>DEMONSTRAÇÃO</b><span>Dados fictícios. Nada é gravado: recarregue a página para recomeçar.</span>
<label>Ver como <select onchange="DEMO.trocarPerfil(this.value)"><option value="gestor">Gestor dos cadastros</option><option value="tecnico">Técnico GMAP</option></select></label></div>"""
html = html.replace('<div class="avisos" id="avisos" aria-live="polite"></div>', '<div class="avisos" id="avisos" aria-live="polite"></div>\n' + barra)

dados = json.loads(ler(demo / "dados_exemplo.json"))
config = 'window.CADASTROS_CONFIG = { SUPABASE_URL: "https://demonstracao.local", SUPABASE_ANON_KEY: "demonstracao" };'
scripts = [
    "(function(){var l=" + json.dumps(logo) + ";document.querySelectorAll('[data-logo]').forEach(function(i){i.src=l});"
    "document.querySelectorAll('[data-logo-icone]').forEach(function(i){i.href=l});})();",
    "window.__DADOS_DEMO = " + json.dumps(dados, ensure_ascii=False) + ";",
    ler(docs / "ui.js"), ler(demo / "cliente_simulado.js"), config,
    ler(docs / "cadastros.js"), ler(docs / "telas.js"), ler(docs / "app.js"),
]
html = re.sub(r'<script src="https://cdn.jsdelivr.net/npm/@supabase[^>]*></script>\s*', "", html)
html = re.sub(r'<script src="(config|ui|cadastros|telas|app)\.js[^"]*"></script>\s*', "", html)
html = html.replace("</body>", "".join("<script>\n" + s.replace("</script", "<\\/script") + "\n</script>\n" for s in scripts) + "</body>")

saida = demo / "demonstracao.html"
saida.write_text(html, encoding="utf-8")
print(f"Gerado {saida} ({saida.stat().st_size // 1024} KB)")
