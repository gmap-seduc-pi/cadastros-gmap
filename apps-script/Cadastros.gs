/**
 * Cadastros GMAP · SEDUC-PI
 * Apps Script da planilha BASE - CADASTROS (Extensões > Apps Script, na própria planilha).
 *
 * Duas fases:
 *  1. CARGA INICIAL: o menu "Enviar planilha ao banco" manda as abas ENTIDADES e MATERIAIS
 *     para o banco. Pode ser repetido até a carga ser marcada como concluída no sistema.
 *  2. ESPELHO: depois da conclusão, o banco é a fonte. O script reescreve as abas ENTIDADES e
 *     MATERIAIS a partir do banco (todo dia às 4h e quando pedido pelo menu), com os mesmos
 *     cabeçalhos, para o Painel de O.S. e o Kanban continuarem funcionando sem mudança.
 *     O espelho NUNCA leva dados pessoais (a aba é publicada na web para o Kanban).
 *
 * Versão 1.0.2: o espelho confere as listas suspensas antes de gravar e restaura a aba se algo falhar.
 *
 * Propriedades do script (Configurações do projeto > Propriedades do script):
 *   SUPABASE_URL         https://xxxx.supabase.co
 *   SUPABASE_SECRET_KEY  chave secreta (sb_secret_... ou service_role). Nunca copie para o GitHub.
 */

const ABA_ENTIDADES = 'ENTIDADES';
const ABA_MATERIAIS = 'MATERIAIS';
const ABA_PENDENCIAS = 'PENDÊNCIAS DA CARGA';

// Cabeçalho da planilha → campo enviado ao banco
const COLUNAS_ENTIDADES = {
  'ID SISTEMA': 'id', 'INEP': 'inep', 'NOME ENTIDADE': 'nome', 'MUNICIPIO': 'municipio', 'GRE/CIDADE': 'gre_cidade', 'GRE': 'gre',
  'ENDERECOS': 'endereco', 'GOOGLE PLUS CODE': 'plus_code', 'TIPOLOGIA': 'tipologia', 'TERRITORIO': 'territorio',
  'BAIRROS': 'bairro', 'CNPJ': 'cnpj', 'ZONA': 'zona'
};
const COLUNAS_MATERIAIS = {
  'CODIGO': 'codigo', 'FKMATERIAL: DESCRICAOMATERIAL': 'descricao', 'CLASSE': 'classe', 'TIPO': 'tipo', 'QTD TOMBOS': 'qtd'
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Cadastros GMAP')
    .addItem('1. Enviar planilha ao banco (carga inicial)', 'enviarCargaInicial')
    .addSeparator()
    .addItem('2. Atualizar espelho agora', 'atualizarEspelhoComAviso')
    .addItem('3. Instalar atualização diária do espelho (4h)', 'instalarGatilhoEspelho')
    .addToUi();
}

// ---------------------------------------------------------------------
// 1. Carga inicial
// ---------------------------------------------------------------------
function enviarCargaInicial() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.alert('Enviar planilha ao banco',
    'As abas ENTIDADES e MATERIAIS serão enviadas ao banco. Registros com o mesmo código serão atualizados com os dados da planilha. Continuar?',
    ui.ButtonSet.YES_NO);
  if (resp !== ui.Button.YES) return;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Outra operação está em andamento.');
  try {
    const ent = lerAba(ABA_ENTIDADES, COLUNAS_ENTIDADES, ['nome', 'tipologia']);
    const mat = lerAba(ABA_MATERIAIS, COLUNAS_MATERIAIS, ['codigo', 'descricao']);
    const rEnt = chamarRpc('importar_entidades', { payload: ent });
    const rMat = chamarRpc('importar_materiais', { payload: mat });
    gravarPendencias(rEnt.pendencias, rMat.pendencias);
    const tot = rEnt.pendencias.length + rMat.pendencias.length;
    ui.alert('Carga enviada',
      `Entidades: ${rEnt.lidas} lidas · ${rEnt.incluidas} novas · ${rEnt.alteradas} alteradas` +
      (rEnt.no_banco_fora_da_planilha ? ` · ${rEnt.no_banco_fora_da_planilha} no banco e não na planilha` : '') +
      `\nMateriais: ${rMat.lidas} lidos · ${rMat.incluidas} novos · ${rMat.alteradas} alterados` +
      (tot ? `\n\n${tot} pendência(s) listada(s) na aba "${ABA_PENDENCIAS}". Corrija e envie de novo, ou corrija direto no sistema.` : '\n\nNenhuma pendência.'),
      ui.ButtonSet.OK);
  } finally {
    lock.releaseLock();
  }
}

function lerAba(nomeAba, mapa, obrigatorias) {
  const aba = SpreadsheetApp.getActive().getSheetByName(nomeAba);
  if (!aba) throw new Error(`Aba ${nomeAba} não encontrada.`);
  const valores = aba.getDataRange().getDisplayValues();   // valores como aparecem (preserva zeros e "N")
  const cab = valores[0].map(normalizar);
  const idx = {};
  Object.keys(mapa).forEach(h => { idx[mapa[h]] = cab.indexOf(normalizar(h)); });
  const faltando = obrigatorias.filter(c => idx[c] < 0);
  if (faltando.length) throw new Error(`Colunas obrigatórias não encontradas na aba ${nomeAba}: ${faltando.join(', ')}`);
  return valores.slice(1).map(l => {
    const o = {};
    Object.keys(idx).forEach(c => { o[c] = idx[c] >= 0 ? String(l[idx[c]]).trim() : ''; });
    return o;
  });
}

function gravarPendencias(pEnt, pMat) {
  const ss = SpreadsheetApp.getActive();
  let aba = ss.getSheetByName(ABA_PENDENCIAS);
  if (!aba) aba = ss.insertSheet(ABA_PENDENCIAS);
  aba.clearContents();
  const linhas = [['Aba', 'Linha', 'Registro', 'Problema']]
    .concat(pEnt.map(p => [ABA_ENTIDADES, p.linha, p.registro, p.problema]))
    .concat(pMat.map(p => [ABA_MATERIAIS, p.linha, p.registro, p.problema]));
  aba.getRange(1, 1, linhas.length, 4).setValues(linhas);
  aba.getRange(1, 1, 1, 4).setFontWeight('bold');
  aba.setFrozenRows(1);
}

// ---------------------------------------------------------------------
// 2. Espelho (banco → planilha)
// ---------------------------------------------------------------------
function atualizarEspelhoComAviso() {
  const r = atualizarEspelho();
  SpreadsheetApp.getUi().alert('Espelho', r.mensagem, SpreadsheetApp.getUi().ButtonSet.OK);
}

function atualizarEspelho() {
  const config = lerTabela('configuracao', 'carga_inicial_concluida')[0];
  if (!config || !config.carga_inicial_concluida) {
    return { mensagem: 'A carga inicial ainda não foi concluída no sistema. Enquanto isso, a planilha continua sendo a fonte e o espelho não é gravado.' };
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Outra operação está em andamento.');
  try {
    const nEnt = escreverEspelho(ABA_ENTIDADES, lerTabela('espelho_entidades', '*', '"ID SISTEMA"'));
    const nMat = escreverEspelho(ABA_MATERIAIS, lerTabela('espelho_materiais', '*', '"Código"'));
    const msg = `Espelho atualizado em ${Utilities.formatDate(new Date(), 'America/Fortaleza', 'dd/MM/yyyy HH:mm')}: ${nEnt} entidades e ${nMat} materiais.`;
    console.log(msg);
    return { mensagem: msg };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Reescreve a aba com as linhas do banco, mantendo o cabeçalho e a ordem das colunas da planilha.
 * Segurança (v1.0.2):
 *  1. confere ANTES de mexer na aba se algum valor seria recusado pelas listas suspensas
 *     (validação de dados) da planilha; se houver, não altera nada e lista os problemas;
 *  2. guarda uma cópia da aba e, se a gravação falhar no meio, devolve o conteúdo original.
 */
function escreverEspelho(nomeAba, linhas) {
  const aba = SpreadsheetApp.getActive().getSheetByName(nomeAba);
  if (!aba) throw new Error(`Aba ${nomeAba} não encontrada.`);
  if (!linhas.length) throw new Error(`O banco não devolveu ${nomeAba}. Espelho não alterado, por segurança.`);
  const chaves = Object.keys(linhas[0]);
  const ultimaCol = Math.max(aba.getLastColumn(), 1);
  const cab = aba.getRange(1, 1, 1, ultimaCol).getValues()[0].map(String);
  // colunas do banco que não existem na planilha entram no fim
  chaves.forEach(k => { if (!cab.some(h => normalizar(h) === normalizar(k))) cab.push(k); });
  const mapa = cab.map(h => chaves.find(k => normalizar(k) === normalizar(h)) || null);
  const semOrigem = cab.filter((h, i) => h && !mapa[i]);
  if (semOrigem.length) console.warn(`${nomeAba}: colunas sem correspondência no banco ficarão vazias: ${semOrigem.join(', ')}`);
  const dados = linhas.map(r => mapa.map(k => (k ? (r[k] === null ? '' : String(r[k])) : '')));

  // 1. Conferência prévia contra as listas suspensas da planilha
  const recusados = conferirValidacoes_(aba, cab, dados);
  if (recusados.length) {
    throw new Error(`Espelho NÃO alterado: ${recusados.length} valor(es) seriam recusados pelas listas suspensas da aba ${nomeAba}. ` +
      `Exemplos: ${recusados.slice(0, 5).join(' | ')}`);
  }

  // 2. Cópia de segurança e gravação
  const linhasAntes = Math.max(aba.getLastRow() - 1, 0), colsAntes = Math.max(aba.getLastColumn(), cab.length);
  const copia = linhasAntes ? aba.getRange(2, 1, linhasAntes, colsAntes).getValues() : [];
  try {
    aba.getRange(1, 1, 1, cab.length).setValues([cab]);
    if (linhasAntes) aba.getRange(2, 1, linhasAntes, colsAntes).clearContent();
    aba.getRange(2, 1, dados.length, cab.length).setNumberFormat('@').setValues(dados);   // texto: preserva zeros à esquerda
    SpreadsheetApp.flush();
  } catch (e) {
    if (linhasAntes) {
      aba.getRange(2, 1, Math.max(dados.length, linhasAntes), colsAntes).clearContent();
      aba.getRange(2, 1, linhasAntes, colsAntes).setValues(copia);
      SpreadsheetApp.flush();
    }
    throw new Error(`Falha ao gravar a aba ${nomeAba}; o conteúdo anterior foi restaurado. Detalhe: ${e.message}`);
  }

  // Aviso a quem tentar editar à mão (só cria se a aba ainda não tiver proteção própria)
  if (!aba.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) {
    aba.protect().setDescription('Espelho dos Cadastros GMAP: edite no sistema, não aqui (a planilha é reescrita todo dia).').setWarningOnly(true);
  }
  return dados.length;
}

/** Lista os valores que as regras de validação (listas suspensas) da linha 2 recusariam. */
function conferirValidacoes_(aba, cab, dados) {
  const regras = aba.getRange(2, 1, 1, cab.length).getDataValidations()[0];
  const recusados = [];
  regras.forEach((regra, c) => {
    if (!regra || regra.getAllowInvalid()) return;   // sem regra, ou regra que só avisa
    const tipo = regra.getCriteriaType(), args = regra.getCriteriaValues();
    let permitidos = null;
    if (tipo === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) permitidos = args[0];
    if (tipo === SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE) permitidos = [].concat.apply([], args[0].getDisplayValues());
    if (!permitidos) return;   // outros tipos de regra não são conferidos
    const ok = new Set(permitidos.map(v => String(v).trim()));
    dados.forEach((l, i) => {
      const v = String(l[c]).trim();
      if (v && !ok.has(v)) recusados.push(`linha ${i + 2}, ${cab[c]}: "${v}"`);
    });
  });
  return recusados;
}

function instalarGatilhoEspelho() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'atualizarEspelho').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('atualizarEspelho').timeBased().everyDays(1).atHour(4).nearMinute(17).create();
  SpreadsheetApp.getUi().alert('Atualização diária instalada (por volta das 4h, antes da importação do Painel de O.S. às 5h).');
}

// ---------------------------------------------------------------------
// Acesso ao banco
// ---------------------------------------------------------------------
function cabecalhos_() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('SUPABASE_URL'), chave = props.getProperty('SUPABASE_SECRET_KEY');
  if (!url || !chave) throw new Error('Configure SUPABASE_URL e SUPABASE_SECRET_KEY nas propriedades do script.');
  const headers = { apikey: chave };
  if (chave.indexOf('eyJ') === 0) headers.Authorization = 'Bearer ' + chave;   // chave service_role no formato antigo (JWT)
  return { base: url.replace(/\/$/, '') + '/rest/v1/', headers: headers };
}

function responder_(resp) {
  const codigo = resp.getResponseCode(), texto = resp.getContentText();
  if (codigo >= 300) {
    let msg = texto; try { msg = JSON.parse(texto).message || texto; } catch (e) {}
    throw new Error(`Supabase respondeu ${codigo}: ${String(msg).slice(0, 500)}`);
  }
  return texto ? JSON.parse(texto) : null;
}

function chamarRpc(funcao, corpo) {
  const c = cabecalhos_();
  return responder_(UrlFetchApp.fetch(c.base + 'rpc/' + funcao, {
    method: 'post', contentType: 'application/json', headers: c.headers, payload: JSON.stringify(corpo), muteHttpExceptions: true
  }));
}

/** Lê uma tabela ou visão inteira, de 1000 em 1000 linhas (ordem fixa para a paginação não pular linhas). */
function lerTabela(nome, colunas, ordem) {
  const c = cabecalhos_();
  const todas = [];
  for (let de = 0; ; de += 1000) {
    const h = Object.assign({}, c.headers, { Range: `${de}-${de + 999}`, 'Range-Unit': 'items' });
    const parte = responder_(UrlFetchApp.fetch(c.base + nome + '?select=' + encodeURIComponent(colunas) + (ordem ? '&order=' + encodeURIComponent(ordem) : ''), { headers: h, muteHttpExceptions: true }));
    todas.push.apply(todas, parte);
    if (parte.length < 1000) break;
  }
  return todas;
}

function normalizar(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/º|ª/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();
}
