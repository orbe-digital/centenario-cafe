/* =========================================================
   CENTENÁRIO CAFÉ — painel do cardápio
   Lê e grava data/menu.json no repositório via API do GitHub.
   Login: admin/users.json guarda o token do GitHub cifrado com a senha
   de cada usuário (ver tools/admin-user.mjs e ADMIN.md).
   ========================================================= */
'use strict';

const MENU_PATH = 'data/menu.json';
const SESSION_KEY = 'centenario-admin-session';
const DRAFT_KEY = 'centenario-admin-draft';
const PRICE_RE = /^\d{1,3}(\.\d{3})*,\d{2}$/;

const $ = s => document.querySelector(s);
const main = $('#main');

let cfg = null;          // { repo, branch, users }
let auth = null;         // { user, token }
let menu = null;         // conteúdo de data/menu.json
let sha = null;          // versão do arquivo no GitHub (para detectar conflito)
let dirty = false;
let sel = 0;             // categoria selecionada
let query = '';
const previews = new Map(); // caminho da foto -> blob URL (antes de o site republicar)

/* ---------- utilitários ---------- */
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k in el) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...kids.flat().filter(x => x != null && x !== false));
  return el;
}
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const slugify = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
const fromB64 = s => Uint8Array.from(atob(s.replace(/\s/g, '')), c => c.charCodeAt(0));
function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function setField(obj, key, value) {
  if (value === '' || value == null) delete obj[key]; else obj[key] = value;
}
function fmtPrice(raw) {
  const v = String(raw).replace(/R\$|\s/g, '');
  if (!v || PRICE_RE.test(v)) return v;
  if (/^\d+([.,]\d{1,2})?$/.test(v)) {
    return Number(v.replace(',', '.')).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return v;
}
const itemCount = c => (c.blocks || []).reduce((s, b) => s + (b.items || []).length, 0);
const groupTitle = id => menu.groups?.find(g => g.id === id)?.title || id || '';

let toastTimer;
function toast(msg, kind = 'ok', sticky = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  if (!sticky) toastTimer = setTimeout(() => t.classList.remove('show'), kind === 'err' ? 9000 : 4500);
}
function status(text, kind = '') {
  const s = $('#status');
  s.textContent = text;
  s.className = `status ${kind}`;
}

/* ---------- criptografia (mesmo formato do tools/admin-user.mjs) ---------- */
async function decrypt(entry, password) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(entry.salt), iterations: entry.iter },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(entry.iv) }, key, fromB64(entry.data));
  return new TextDecoder().decode(out);
}

/* ---------- API do GitHub ---------- */
async function gh(path, opts = {}) {
  const r = await fetch(`https://api.github.com/repos/${cfg.repo}/${path}`, {
    cache: 'no-store',
    ...opts,
    headers: {
      Authorization: `Bearer ${auth.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!r.ok) {
    const detail = (await r.json().catch(() => ({}))).message || '';
    console.error('GitHub', r.status, detail);
    const msg = r.status === 401
      ? 'O acesso ao GitHub expirou ou foi revogado. Peça ao responsável pelo site para gerar um novo token.'
      : r.status === 403 && /rate limit/i.test(detail)
        ? 'Limite de uso da API do GitHub atingido. Tente de novo em alguns minutos.'
        : r.status === 403
          ? 'O token deste usuário não tem permissão de escrita no repositório (precisa de "Contents: Read and write"). ' +
            'Peça ao responsável pelo site para gerar um novo token e recadastrar o usuário.'
          : `O GitHub recusou a operação (erro ${r.status}${detail ? `: ${detail}` : ''}).`;
    const e = new Error(msg);
    e.status = r.status;
    throw e;
  }
  return r.json();
}
async function readFile(path) {
  const j = await gh(`contents/${path}?ref=${encodeURIComponent(cfg.branch)}`);
  return { text: new TextDecoder().decode(fromB64(j.content)), sha: j.sha };
}
async function writeFile(path, base64, message, prevSha) {
  const body = { message, content: base64, branch: cfg.branch };
  if (prevSha) body.sha = prevSha;
  const j = await gh(`contents/${path}`, { method: 'PUT', body: JSON.stringify(body) });
  return j.content.sha;
}
function fail(e) {
  console.error(e);
  if (e.status === 401) { logout(e.message); return; }
  toast(e.message || 'Algo deu errado. Verifique a internet e tente de novo.', 'err');
}

/* ---------- login ---------- */
function showLogin(msg = '') {
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#loginMsg').textContent = msg;
  $('#loginForm').elements.user.focus();
}

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target.elements;
  const user = f.user.value.trim().toLowerCase();
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  $('#loginMsg').textContent = 'Verificando…';
  const entry = cfg.users.find(u => u.user === user);
  let token = null;
  if (entry) { try { token = await decrypt(entry, f.pass.value); } catch { /* senha errada */ } }
  btn.disabled = false;
  if (!token) { $('#loginMsg').textContent = 'Usuário ou senha incorretos.'; return; }
  f.pass.value = '';
  auth = { user, token };
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(auth)); } catch {}
  start();
});

function logout(msg = '') {
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  auth = null; menu = null; dirty = false;
  showLogin(msg);
}
$('#logout').addEventListener('click', () => {
  if (dirty && !confirm('Há alterações não publicadas. Elas ficam guardadas neste navegador como rascunho. Sair mesmo assim?')) return;
  logout();
});

/* ---------- carregamento ---------- */
async function boot() {
  try {
    const r = await fetch('users.json', { cache: 'no-cache' });
    cfg = await r.json();
    if (!cfg.users?.length) throw 0;
  } catch {
    $('#login').hidden = false;
    $('#loginForm').replaceChildren(
      h('img', { src: '../assets/logo-centenario.webp', alt: 'Centenário Café', width: 760, height: 552 }),
      h('h1', {}, 'Painel ainda não configurado'),
      h('p', { class: 'msg' }, 'Nenhum usuário foi criado. Veja as instruções em ADMIN.md no repositório.'));
    return;
  }
  try { auth = JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch {}
  if (auth?.token) start(); else showLogin();
}

async function start() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#who').textContent = auth.user;
  main.replaceChildren(h('p', { class: 'empty' }, 'Carregando cardápio…'));
  try {
    const f = await readFile(MENU_PATH);
    menu = JSON.parse(f.text);
    sha = f.sha;
  } catch (e) {
    if (e.status === 401) return logout(e.message);
    main.replaceChildren(h('p', { class: 'empty' }, 'Não foi possível carregar o cardápio. ', e.message || ''));
    return;
  }
  restoreDraft();
  setDirty(dirty);
  render();
}

/* ---------- rascunho local (protege contra fechar a aba sem publicar) ---------- */
let draftTimer;
function saveDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ sha, menu, at: Date.now() })); } catch {}
  }, 400);
}
function clearDraft() {
  clearTimeout(draftTimer);
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
}
function restoreDraft() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch {}
  if (!d?.menu) return;
  const when = new Date(d.at).toLocaleString('pt-BR');
  const ask = d.sha === sha
    ? `Existem alterações não publicadas salvas neste navegador (${when}). Recuperar?`
    : `Existe um rascunho não publicado de ${when}, mas o cardápio foi alterado depois disso. ` +
      'Recuperar o rascunho substitui a versão atual. Recuperar mesmo assim?';
  if (confirm(ask)) { menu = d.menu; dirty = true; } else clearDraft();
}

function setDirty(v) {
  dirty = v;
  $('#publish').disabled = !v;
  if (v) status('Alterações não publicadas', 'warn'); else status('Tudo publicado', 'ok');
}
function changed(rerender = false) {
  setDirty(true);
  saveDraft();
  if (rerender) render();
}
addEventListener('beforeunload', e => { if (dirty) e.preventDefault(); });

/* ---------- campos ---------- */
const field = (label, control, cls = '') => h('label', { class: `field ${cls}` }, h('span', {}, label), control);

function input(obj, key, props = {}, after) {
  return h('input', {
    ...props,
    value: obj[key] || '',
    oninput: e => { setField(obj, key, e.target.value.trim() ? e.target.value : ''); changed(); after?.(); },
  });
}
function textarea(obj, key, props = {}) {
  return h('textarea', {
    rows: 2, ...props, value: obj[key] || '',
    oninput: e => { setField(obj, key, e.target.value.trim() ? e.target.value : ''); changed(); },
  });
}
function select(obj, key, options, { fallback, rerender = false } = {}) {
  const cur = obj[key] || fallback || '';
  return h('select', {
    onchange: e => { setField(obj, key, e.target.value); changed(rerender); },
  }, options.map(([v, label]) => h('option', { value: v, selected: v === cur }, label)));
}
function priceInput(obj, key) {
  const el = h('input', {
    value: obj[key] || '', inputMode: 'decimal', placeholder: '0,00', class: 'price',
    oninput: e => { setField(obj, key, e.target.value.trim()); changed(); },
    onblur: e => {
      const v = fmtPrice(e.target.value);
      e.target.value = v;
      setField(obj, key, v);
      e.target.classList.toggle('bad', !!v && !PRICE_RE.test(v));
    },
  });
  if (obj[key] && !PRICE_RE.test(obj[key])) el.classList.add('bad');
  return el;
}
function checkbox(obj, key, label, value = true) {
  const on = value === true ? !!obj[key] : obj[key] === value;
  return h('label', { class: 'check' },
    h('input', { type: 'checkbox', checked: on, onchange: e => { if (e.target.checked) obj[key] = value; else delete obj[key]; changed(true); } }),
    label);
}
function moveBtns(arr, i, onMove) {
  const move = d => { [arr[i], arr[i + d]] = [arr[i + d], arr[i]]; onMove?.(i + d); changed(true); };
  return h('span', { class: 'move' },
    h('button', { class: 'icon', title: 'Mover para cima', 'aria-label': 'Mover para cima', disabled: i === 0, onclick: () => move(-1) }, '↑'),
    h('button', { class: 'icon', title: 'Mover para baixo', 'aria-label': 'Mover para baixo', disabled: i === arr.length - 1, onclick: () => move(1) }, '↓'));
}

/* ---------- renderização ---------- */
function render() {
  renderSide();
  if (query) renderSearch(); else renderCategory();
}

function renderSide() {
  const list = $('#catList');
  const nodes = [];
  let lastGroup = null;
  menu.categories.forEach((c, i) => {
    const g = c.group || menu.groups?.[0]?.id;
    if (g !== lastGroup) { nodes.push(h('p', { class: 'grp' }, groupTitle(g))); lastGroup = g; }
    nodes.push(h('div', { class: `cat-item${i === sel && !query ? ' active' : ''}${c.hidden ? ' off' : ''}` },
      h('button', { class: 'cat-name', onclick: () => { sel = i; query = ''; $('#q').value = ''; render(); scrollTo(0, 0); } },
        c.title || '(sem nome)', h('small', {}, c.hidden ? 'oculta' : `${itemCount(c)} itens`)),
      moveBtns(menu.categories, i, to => { if (sel === i) sel = to; else if (sel === to) sel = i; })));
  });
  list.replaceChildren(...nodes);
}

function renderCategory() {
  const c = menu.categories[sel];
  if (!c) { main.replaceChildren(h('p', { class: 'empty' }, 'Nenhuma categoria. Crie uma no menu ao lado.')); return; }
  const groups = (menu.groups || []).map(g => [g.id, g.title]);
  const isCards = c.layout === 'cards';
  main.replaceChildren(
    h('section', { class: 'card cat-card' },
      h('div', { class: 'grid2' },
        field('Nome da categoria', input(c, 'title', { required: true }, renderSide)),
        field('Cardápio', select(c, 'group', groups, { fallback: groups[0]?.[0], rerender: true }))),
      field('Observação da categoria (opcional)', textarea(c, 'note', { placeholder: 'ex.: Taxa de rolha: R$ 60,00.' })),
      h('div', { class: 'opts' },
        checkbox(c, 'layout', 'Mostrar como cards com foto de cada produto (estilo da carta de drinks)', 'cards')),
      !isCards && photoField(c, 'img', {
        title: c.title,
        styleCtl: field('Estilo da foto', select(c, 'imgStyle', [['arch', 'Foto em arco (foto normal)'], ['cutout', 'Recorte (PNG com fundo transparente)']], { fallback: 'arch' })),
        cutout: c.imgStyle === 'cutout',
      }),
      h('div', { class: 'actions' },
        checkbox(c, 'hidden', 'Ocultar esta categoria do site'),
        h('button', { class: 'btn danger sm', onclick: () => removeCategory(sel) }, 'Excluir categoria'))),
    ...c.blocks.map((b, bi) => blockCard(c, b, bi)),
    h('button', { class: 'btn add', onclick: () => { c.blocks.push({ title: 'Nova seção', items: [] }); changed(true); } }, '+ Nova seção nesta categoria'));
}

function photoField(obj, key, { title, styleCtl, cutout = false, small = false } = {}) {
  const path = obj[key];
  const src = path ? (previews.get(path) || `../${path}`) : null;
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: e => uploadPhoto(obj, key, e.target.files[0], title, cutout) });
  return h('div', { class: `photo${small ? ' small' : ''}${cutout ? ' cutout' : ''}` },
    src ? h('img', { src, alt: '' }) : h('div', { class: 'ph' }, 'Sem foto'),
    h('div', { class: 'photo-side' },
      styleCtl,
      h('div', { class: 'photo-actions' },
        h('button', { class: 'btn ghost sm', onclick: () => file.click() }, path ? 'Trocar foto' : 'Adicionar foto'),
        path && h('button', { class: 'btn ghost sm', onclick: () => { delete obj[key]; changed(true); } }, 'Remover foto'),
        file)));
}

function blockCard(c, b, bi) {
  const isCards = c.layout === 'cards';
  return h('section', { class: 'card block' },
    h('div', { class: 'grid2' },
      field('Título da seção (opcional)', input(b, 'title', { placeholder: 'ex.: Tapiocas' })),
      field('Observação (opcional)', input(b, 'note', { placeholder: 'ex.: Acompanha torradas.' }))),
    h('div', { class: 'actions' },
      !isCards ? checkbox(b, 'compact', 'Lista compacta (só nome e preço)') : h('span', { class: 'spacer' }),
      moveBtns(c.blocks, bi),
      h('button', { class: 'btn danger sm', onclick: () => {
        if (confirm(`Excluir a seção${b.title ? ` "${b.title}"` : ''} com ${b.items.length} produto(s)?`)) { c.blocks.splice(bi, 1); changed(true); }
      } }, 'Excluir seção')),
    h('div', { class: 'items' }, b.items.map((it, ii) => itemRow(c, b, it, bi, ii))),
    h('button', { class: 'btn add sm', onclick: () => {
      b.items.push({ name: '', price: '' });
      changed(true);
      main.querySelector(`[data-key="${bi}-${b.items.length - 1}"] input`)?.focus();
    } }, '+ Adicionar produto'));
}

function itemRow(c, b, it, bi, ii) {
  const isCards = c.layout === 'cards';
  const full = isCards || !b.compact;
  const hasVars = !!it.variants?.length;
  return h('article', { class: `item${it.hidden ? ' off' : ''}`, 'data-key': `${bi}-${ii}` },
    h('div', { class: 'item-grid' },
      field('Produto', input(it, 'name', { required: true }), 'name'),
      !hasVars && field('Preço (R$)', priceInput(it, 'price'), 'pfield'),
      full && field('Selo (opcional)', input(it, 'tag', { placeholder: 'ex.: da casa' }), 'tag')),
    field(b.compact && !isCards ? 'Complemento (opcional)' : 'Descrição', textarea(it, 'desc', { rows: b.compact && !isCards ? 1 : 2 })),
    isCards && photoField(it, 'img', { title: it.name || c.title, small: true }),
    full && !isCards && variantsEditor(it),
    h('div', { class: 'actions' },
      checkbox(it, 'hidden', 'Ocultar (esgotado)'),
      moveBtns(b.items, ii),
      h('button', { class: 'btn danger sm', onclick: () => {
        if (confirm(`Excluir "${it.name || 'produto sem nome'}"?`)) { b.items.splice(ii, 1); changed(true); }
      } }, 'Excluir')));
}

function variantsEditor(it) {
  const vs = it.variants || [];
  return h('div', { class: 'variants' },
    vs.length > 0 && h('span', { class: 'vlabel' }, 'Variações (tamanho, dose, clube…)'),
    vs.map((v, vi) => h('div', { class: 'variant' },
      input(v, 'label', { placeholder: 'ex.: Dose', 'aria-label': 'Nome da variação' }),
      priceInput(v, 'price'),
      h('button', { class: 'icon', title: 'Remover variação', 'aria-label': 'Remover variação', onclick: () => {
        vs.splice(vi, 1);
        if (!vs.length) { it.price = v.price || ''; delete it.variants; }
        changed(true);
      } }, '×'))),
    h('button', { class: 'link', onclick: () => {
      if (!it.variants) { it.variants = [{ label: '', price: it.price || '' }]; delete it.price; }
      else it.variants.push({ label: '', price: '' });
      changed(true);
    } }, vs.length ? '+ Adicionar variação' : '+ Usar variações (ex.: pequeno / grande)'));
}

/* ---------- busca rápida (troca de preço sem procurar a categoria) ---------- */
$('#q').addEventListener('input', e => { query = e.target.value.trim(); render(); });

function renderSearch() {
  const t = norm(query);
  const rows = [];
  menu.categories.forEach((c, ci) => c.blocks.forEach((b, bi) => b.items.forEach((it, ii) => {
    if (!norm(`${it.name} ${it.desc || ''}`).includes(t)) return;
    const prices = it.variants?.length
      ? it.variants.map(v => h('label', { class: 'mini' }, h('span', {}, v.label || '—'), priceInput(v, 'price')))
      : [h('label', { class: 'mini' }, h('span', {}, 'R$'), priceInput(it, 'price'))];
    rows.push(h('div', { class: `result${it.hidden ? ' off' : ''}` },
      h('div', { class: 'r-info' },
        h('b', {}, it.name || '(sem nome)'),
        h('small', {}, [groupTitle(c.group), c.title, b.title].filter(Boolean).join(' › '))),
      h('div', { class: 'r-prices' }, prices),
      h('button', { class: 'btn ghost sm', onclick: () => openItem(ci, bi, ii) }, 'Abrir')));
  })));
  main.replaceChildren(
    h('h2', { class: 'rhead' }, rows.length ? `${rows.length} resultado(s) para "${query}"` : `Nada encontrado para "${query}"`),
    ...rows);
}
function openItem(ci, bi, ii) {
  sel = ci; query = ''; $('#q').value = '';
  render();
  const el = main.querySelector(`[data-key="${bi}-${ii}"]`);
  if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); el.querySelector('input')?.focus({ preventScroll: true }); }
}

/* ---------- categorias ---------- */
$('#addCat').addEventListener('click', () => {
  const group = menu.categories[sel]?.group || menu.groups?.[0]?.id;
  // entra logo depois da última categoria do mesmo cardápio
  let at = menu.categories.length;
  menu.categories.forEach((c, i) => { if (c.group === group) at = i + 1; });
  menu.categories.splice(at, 0, { title: 'Nova categoria', group, blocks: [{ items: [] }] });
  sel = at;
  query = ''; $('#q').value = '';
  changed(true);
  const t = main.querySelector('input');
  t?.focus(); t?.select();
});
function removeCategory(i) {
  const c = menu.categories[i];
  if (!confirm(`Excluir a categoria "${c.title}" com ${itemCount(c)} produto(s)? Isso não pode ser desfeito depois de publicar.`)) return;
  menu.categories.splice(i, 1);
  sel = Math.max(0, i - 1);
  changed(true);
}

/* ---------- fotos ---------- */
// Recortes (fundo transparente) viram PNG; o resto vira JPEG leve.
async function shrink(file, { max = 1000, transparent = false } = {}) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = h('canvas', { width: Math.round(img.width * scale), height: Math.round(img.height * scale) });
  const ctx = canvas.getContext('2d');
  if (!transparent) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const type = transparent ? 'image/png' : 'image/jpeg';
  return new Promise((ok, no) => canvas.toBlob(b => b ? ok(b) : no(new Error('Não foi possível processar a imagem.')), type, 0.82));
}
async function uploadPhoto(obj, key, file, title, transparent) {
  if (!file) return;
  toast('Enviando foto…', 'ok', true);
  try {
    const blob = await shrink(file, { max: transparent ? 800 : 1000, transparent });
    const ext = transparent ? 'png' : 'jpg';
    const path = `assets/menu/${slugify(title)}-${Date.now().toString(36)}.${ext}`;
    await writeFile(path, toB64(new Uint8Array(await blob.arrayBuffer())), `Foto "${title}" (painel, ${auth.user})`);
    previews.set(path, URL.createObjectURL(blob));
    obj[key] = path;
    changed(true);
    toast('Foto enviada. Clique em "Publicar alterações" para ela aparecer no site.');
  } catch (e) { fail(e); }
}

/* ---------- publicar ---------- */
function assignIds() {
  const used = new Set(menu.categories.map(c => c.id).filter(Boolean));
  for (const c of menu.categories) {
    if (c.id) continue;
    let id = slugify(c.title), n = 2;
    while (used.has(id)) id = `${slugify(c.title)}-${n++}`;
    c.id = id;
    used.add(id);
  }
}
function validate() {
  const errs = [];
  menu.categories.forEach((c, ci) => {
    const where = c.title || `Categoria ${ci + 1}`;
    if (!c.title?.trim()) errs.push({ ci, msg: `Uma categoria está sem nome.` });
    c.blocks.forEach(b => b.items.forEach(it => {
      const name = it.name?.trim();
      const tag = `${where} › ${name || 'produto sem nome'}`;
      if (!name) errs.push({ ci, msg: `${where}: há um produto sem nome.` });
      if (it.variants?.length) {
        if (c.layout === 'cards') errs.push({ ci, msg: `${tag}: variações não aparecem nos cards. Use um preço único.` });
        else if (b.compact) errs.push({ ci, msg: `${tag}: variações não aparecem em lista compacta. Use um preço único ou desmarque "Lista compacta".` });
        it.variants.forEach(v => {
          if (!v.label?.trim()) errs.push({ ci, msg: `${tag}: uma variação está sem nome.` });
          if (!PRICE_RE.test(v.price || '')) errs.push({ ci, msg: `${tag}: preço inválido na variação "${v.label || ''}". Use o formato 49,90.` });
        });
      } else if (!PRICE_RE.test(it.price || '')) {
        errs.push({ ci, msg: `${tag}: preço inválido ou vazio. Use o formato 49,90.` });
      }
    }));
  });
  return errs;
}

$('#publish').addEventListener('click', () => publish());
async function publish(force = false) {
  document.activeElement?.blur(); // aplica a formatação do campo de preço em edição
  assignIds();
  const errs = validate();
  if (errs.length) {
    sel = errs[0].ci; query = ''; $('#q').value = '';
    render();
    toast(errs[0].msg + (errs.length > 1 ? ` (e mais ${errs.length - 1} problema(s))` : ''), 'err');
    return;
  }
  $('#publish').disabled = true;
  status('Publicando…');
  try {
    if (force) sha = (await readFile(MENU_PATH)).sha;
    menu.updated = new Date().toLocaleDateString('sv-SE'); // AAAA-MM-DD no fuso local
    const text = JSON.stringify(menu, null, 2) + '\n';
    sha = await writeFile(MENU_PATH, toB64(new TextEncoder().encode(text)), `Cardápio atualizado pelo painel (${auth.user})`, sha);
    clearDraft();
    setDirty(false);
    toast('Publicado! O site mostra as mudanças em 1 a 2 minutos.');
  } catch (e) {
    setDirty(true);
    if (e.status === 409 || e.status === 422) {
      if (confirm('Outra pessoa publicou mudanças no cardápio enquanto você editava.\n\n' +
        'OK = publicar a SUA versão por cima (as mudanças da outra pessoa serão perdidas).\n' +
        'Cancelar = não publicar agora. Seu rascunho fica salvo; recarregue a página para ver a versão nova.')) {
        return publish(true);
      }
      return;
    }
    fail(e);
  }
}

boot();
