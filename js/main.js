/* =========================================================
   Centenário Café — comportamento da página
   ========================================================= */
(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 1. Links a partir do CONFIG ---------- */
  const C = typeof CONFIG !== 'undefined' ? CONFIG : {};
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Centenário Café, ' + (C.endereco || ''))}`;
  const waUrl = C.whatsapp
    ? `https://wa.me/${C.whatsapp}?text=${encodeURIComponent(C.mensagem || '')}`
    : (C.telefone ? `tel:+${C.telefone}` : '');

  const setLinks = (sel, url, { blank = true } = {}) => $$(sel).forEach(a => {
    if (!url) { a.hidden = true; a.style.display = 'none'; return; }
    a.href = url;
    if (!blank) { a.removeAttribute('target'); a.removeAttribute('rel'); }
  });

  const reservaUrl = C.whatsapp
    ? `https://wa.me/${C.whatsapp}?text=${encodeURIComponent(C.mensagemReserva || C.mensagem || '')}`
    : (C.telefone ? `tel:+${C.telefone}` : '');

  setLinks('.js-wa', waUrl, { blank: !!C.whatsapp });
  setLinks('.js-reserva', reservaUrl, { blank: !!C.whatsapp });
  setLinks('.js-maps', mapsUrl);
  setLinks('.js-review', C.avaliacao || mapsUrl);
  setLinks('.js-ig', C.instagram);
  setLinks('.js-tel', C.telefone ? `tel:+${C.telefone}` : '', { blank: false });
  if (!C.telefone) $$('.js-tel-row').forEach(el => el.remove());
  if (!C.whatsapp) {
    $$('.js-wa-label').forEach(el => el.textContent = 'Ligar para reservar');
    $$('.js-wa use').forEach(u => u.setAttribute('href', '#i-phone'));
    $$('.js-wa[aria-label]').forEach(a => a.setAttribute('aria-label', 'Ligar para o Centenário Café'));
    $$('.footer-links .js-wa').forEach(a => a.textContent = 'Telefone');
  }

  const fill = (sel, txt) => $$(sel).forEach(el => { if (txt) el.textContent = txt; });
  fill('.js-address', C.endereco);
  fill('.js-hours', C.horario);
  fill('.js-city', C.cidade);
  fill('.js-tel-label', C.telefoneLabel);
  fill('.js-ig-handle', C.instagramHandle);
  $('#year').textContent = new Date().getFullYear();

  /* ---------- 2. Hero: fotos que se alternam no arco ---------- */
  const archImgs = $$('.arch img');
  if (archImgs.length > 1 && !reduceMotion) {
    let i = 0;
    setInterval(() => {
      archImgs[i].classList.remove('is-on');
      i = (i + 1) % archImgs.length;
      archImgs[i].classList.add('is-on');
    }, 4200);
  }

  /* ---------- 3. Galeria: carrossel contínuo (arrastar, setas, pausa no hover) ---------- */
  const track = $('#track');
  const inner = $('.track-in');
  if (track && inner) {
    // duplica as fotos para emendar o fim no começo sem salto
    const originals = $$('figure', inner);
    originals.forEach(f => {
      const c = f.cloneNode(true);
      c.setAttribute('aria-hidden', 'true');
      c.querySelectorAll('img').forEach(i => { i.alt = ''; });
      inner.appendChild(c);
    });

    const SPEED = 32;                 // px por segundo
    let loopW = 0, pos = 0, target = null, last = 0;
    let hover = false, dragging = false, holdUntil = 0, visible = true;
    const measure = () => { loopW = inner.children[originals.length].offsetLeft - inner.children[0].offsetLeft; };
    const paint = () => {
      if (!loopW) return;
      const x = ((pos % loopW) + loopW) % loopW;
      inner.style.transform = `translate3d(${-x}px,0,0)`;
    };
    const tick = t => {
      const dt = Math.min(64, t - (last || t)) / 1000; last = t;
      if (visible && !dragging) {
        if (target !== null) {
          pos += (target - pos) * Math.min(1, dt * 7);
          if (Math.abs(target - pos) < .5) { pos = target; target = null; }
        } else if (!hover && !reduceMotion && t > holdUntil) {
          pos += SPEED * dt;
        }
      }
      paint();
      requestAnimationFrame(tick);
    };
    measure();
    addEventListener('resize', measure);
    addEventListener('load', measure);
    requestAnimationFrame(tick);

    // pausa fora da tela (economiza bateria)
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(track);

    track.addEventListener('mouseenter', () => { hover = true; });
    track.addEventListener('mouseleave', () => { hover = false; });

    $$('.gallery-nav button').forEach(b => b.addEventListener('click', () => {
      const step = (originals[0]?.offsetWidth || 260) + 16;
      target = (target ?? pos) + Number(b.dataset.dir) * step * 2;
      holdUntil = performance.now() + 2500;
    }));

    // arrastar com mouse ou dedo (rolagem vertical da página continua livre)
    let startX = 0, startPos = 0, moved = false;
    track.addEventListener('pointerdown', e => {
      dragging = true; moved = false; target = null;
      startX = e.clientX; startPos = pos;
      track.setPointerCapture(e.pointerId);
      track.classList.add('is-drag');
    });
    track.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) moved = true;
      pos = startPos - dx;
    });
    const endDrag = () => {
      if (!dragging) return;
      dragging = false; track.classList.remove('is-drag');
      holdUntil = performance.now() + 2000;
    };
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);
    track.addEventListener('click', e => { if (moved) { e.preventDefault(); e.stopPropagation(); } }, true);
    track.addEventListener('dragstart', e => e.preventDefault());
  }

  /* ---------- 4. Cardápio ---------- */
  const menuSec = $('#cardapio');
  const root = $('#menu-root');
  const chips = $('#chips');
  const q = $('#q');
  const searchBox = $('.search');
  const info = $('#search-info');
  const empty = $('#empty');
  const tabs = $$('.tab');
  let groups = [];
  let activeGroup = 'pratos';

  const money = p => `<span class="price"><small>R$</small>${esc(p)}</span>`;

  const itemHTML = (it, catTitle) => {
    const s = norm(`${it.name} ${it.desc || ''} ${it.tag || ''} ${(it.variants || []).map(v => v.label).join(' ')}`);
    const tag = it.tag ? `<span class="tag">${esc(it.tag)}</span>` : '';
    const desc = it.desc ? `<p class="item-desc">${esc(it.desc)}</p>` : '';
    const variants = it.variants?.length
      ? `<ul class="variants">${it.variants.map(v => `<li><span>${esc(v.label)}</span>${money(v.price)}</li>`).join('')}</ul>`
      : '';
    const right = it.price ? `<span class="dots" aria-hidden="true"></span>${money(it.price)}` : '';
    return `<li class="item${it.variants?.length ? ' has-variants' : ''}" data-s="${esc(s)}">
      <div class="item-row"><h4 class="item-name">${esc(it.name)}${tag}</h4>${right}</div>${desc}${variants}</li>`;
  };

  const cardHTML = it => {
    const s = norm(`${it.name} ${it.desc || ''} ${it.tag || ''}`);
    const media = it.img
      ? `<img src="${esc(it.img)}" alt="${esc(it.name)}" loading="lazy" width="480" height="600">`
      : `<span class="dcard-ph" aria-hidden="true">${esc(it.name.trim().charAt(0))}</span>`;
    return `<li class="dcard reveal" data-s="${esc(s)}">
      <div class="dcard-img">${media}${it.tag ? `<span class="tag tag-float">${esc(it.tag)}</span>` : ''}</div>
      <div class="dcard-body">
        <h4>${esc(it.name)}</h4>
        ${it.desc ? `<p>${esc(it.desc)}</p>` : ''}
        ${it.price ? `<span class="price-pill">${money(it.price)}</span>` : ''}
      </div></li>`;
  };

  const catHTML = (cat, groupTitle) => {
    const visibleItems = b => (b.items || []).filter(i => !i.hidden);
    const count = (cat.blocks || []).reduce((n, b) => n + visibleItems(b).length, 0);
    const isCards = cat.layout === 'cards';
    const blocks = (cat.blocks || []).map(b => {
      const items = visibleItems(b);
      if (!items.length) return '';
      const list = isCards
        ? `<ul class="cards">${items.map(cardHTML).join('')}</ul>`
        : `<ul class="items${b.compact ? ' compact' : ''}">${items.map(i => itemHTML(i, cat.title)).join('')}</ul>`;
      return `<div class="block">
        ${b.title ? `<h4 class="block-title">${esc(b.title)}</h4>` : ''}
        ${b.note ? `<p class="note">${esc(b.note)}</p>` : ''}
        ${list}</div>`;
    }).join('');
    const img = cat.img
      ? `<figure class="cat-img ${cat.imgStyle === 'cutout' ? 'is-cutout' : 'is-arch'}"><img src="${esc(cat.img)}" alt="${esc(cat.title)}" loading="lazy" width="560" height="560"></figure>`
      : '';
    return `<section class="cat${isCards ? ' cat-cards' : ''}${cat.img ? ' has-img' : ''}" id="cat-${esc(cat.id)}" data-cat="${esc(cat.id)}" data-s="${esc(norm(cat.title))}">
      <header class="cat-aside">
        <div class="cat-head reveal">
          <p class="eyebrow">${esc(groupTitle)} · ${count} ${count === 1 ? 'opção' : 'opções'}</p>
          <h3>${esc(cat.title)}</h3>
          <span class="diamonds" aria-hidden="true"></span>
          ${cat.note ? `<p class="note">${esc(cat.note)}</p>` : ''}
        </div>
        ${img}
      </header>
      <div class="cat-body">${blocks}</div>
    </section>`;
  };

  const render = data => {
    groups = data.groups || [];
    const cats = (data.categories || []).filter(c => !c.hidden);
    root.innerHTML = groups.map(g => {
      const gc = cats.filter(c => (c.group || groups[0].id) === g.id);
      return `<div class="panel" data-group="${esc(g.id)}" role="tabpanel" aria-label="${esc(g.title)}">
        <h3 class="panel-title">${esc(g.title)}</h3>
        ${gc.map(c => catHTML(c, g.title)).join('')}
      </div>`;
    }).join('');
    buildChips();
    setGroup(activeGroup, { scroll: false });
    observeReveal(root);
    observeSpy();
  };

  const buildChips = () => {
    const panel = $(`.panel[data-group="${activeGroup}"]`, root);
    if (!panel) return;
    chips.innerHTML = $$('.cat', panel).map(c =>
      `<a class="chip" href="#${c.id}" data-target="${c.id}">${esc($('h3', c).textContent)}</a>`).join('');
    applySearch();
  };

  const setGroup = (g, { scroll = true } = {}) => {
    if (!groups.some(x => x.id === g)) g = groups[0]?.id || 'pratos';
    activeGroup = g;
    menuSec.dataset.mode = g;
    tabs.forEach(t => {
      const on = t.dataset.tab === g;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
    });
    moveInk();
    $$('.panel', root).forEach(p => p.classList.toggle('is-active', p.dataset.group === g));
    buildChips();
    if (scroll) {
      const top = menuSec.getBoundingClientRect().top + scrollY - 8;
      if (scrollY > top + 4 || scroll === 'force') scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  };

  const ink = $('.tab-ink');
  const moveInk = () => {
    const t = tabs.find(x => x.dataset.tab === activeGroup);
    if (!t || !ink) return;
    ink.style.width = `${t.offsetWidth}px`;
    ink.style.transform = `translateX(${t.offsetLeft}px)`;
  };
  addEventListener('resize', moveInk);
  document.fonts?.ready.then(moveInk);

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => setGroup(t.dataset.tab));
    t.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      n.focus(); setGroup(n.dataset.tab);
    });
  });

  // Links "Ver cardápio" / "Carta de drinks" abrem a aba certa
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-open-tab]');
    if (!a) return;
    e.preventDefault();
    setGroup(a.dataset.openTab, { scroll: false });
    const top = menuSec.getBoundingClientRect().top + scrollY - 8;
    scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
    history.replaceState(null, '', a.dataset.openTab === 'drinks' ? '#drinks' : '#cardapio');
  });

  /* ---------- 5. Busca sem acento ---------- */
  const applySearch = () => {
    const term = norm(q.value.trim());
    searchBox.classList.toggle('has-value', !!q.value);
    menuSec.classList.toggle('is-searching', !!term);
    let total = 0;

    $$('.panel', root).forEach(panel => {
      let panelHits = 0;
      $$('.cat', panel).forEach(cat => {
        const catMatch = term && cat.dataset.s.includes(term);
        let catHits = 0;
        $$('.block', cat).forEach(block => {
          let bh = 0;
          $$('[data-s]', block).forEach(it => {
            const show = !term || catMatch || it.dataset.s.includes(term);
            it.hidden = !show;
            if (show) bh++;
          });
          block.hidden = !bh;
          catHits += bh;
        });
        cat.hidden = !catHits;
        if (term) total += catHits;
        panelHits += catHits;
        const chip = chips.querySelector(`[data-target="${cat.id}"]`);
        if (chip) chip.hidden = !catHits;
      });
      panel.classList.toggle('has-hits', panelHits > 0);
    });

    // durante a busca, mostramos os resultados dos dois cardápios
    if (term) {
      info.textContent = total ? `${total} ${total === 1 ? 'resultado' : 'resultados'} para “${q.value.trim()}”` : '';
      empty.hidden = total > 0;
      $$('.cards .reveal', root).forEach(el => el.classList.add('in'));
    } else {
      info.textContent = '';
      empty.hidden = true;
    }
  };

  let qt;
  q.addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(applySearch, 90); });
  q.addEventListener('keydown', e => { if (e.key === 'Escape') { q.value = ''; applySearch(); } });
  $('.search-x').addEventListener('click', () => { q.value = ''; applySearch(); q.focus(); });

  /* ---------- 6. Scrollspy das categorias ---------- */
  let spy;
  const observeSpy = () => {
    spy?.disconnect();
    spy = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const ch = chips.querySelector(`[data-target="${e.target.id}"]`);
        if (!ch) return;
        $$('.chip', chips).forEach(c => c.classList.toggle('active', c === ch));
        chips.scrollTo({ left: ch.offsetLeft - chips.clientWidth / 2 + ch.clientWidth / 2, behavior: 'smooth' });
      });
    }, { rootMargin: '-190px 0px -55% 0px' });
    $$('.cat', root).forEach(c => spy.observe(c));
  };

  chips.addEventListener('click', e => {
    const a = e.target.closest('.chip');
    if (!a) return;
    e.preventDefault();
    const el = document.getElementById(a.dataset.target);
    el?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  });

  /* ---------- 7. Revelar ao rolar ---------- */
  const rv = 'IntersectionObserver' in window && !reduceMotion
    ? new IntersectionObserver(es => es.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in'); rv.unobserve(e.target); }
      }), { threshold: .12, rootMargin: '0px 0px -40px 0px' })
    : null;
  const observeReveal = (scope = document) => $$('.reveal:not(.in)', scope).forEach((el, i) => {
    if (!rv) { el.classList.add('in'); return; }
    if (el.classList.contains('dcard')) el.style.transitionDelay = `${(i % 3) * 70}ms`;
    rv.observe(el);
  });
  observeReveal();

  /* ---------- 8. Carregar o JSON ---------- */
  if (location.hash === '#drinks') activeGroup = 'drinks';
  fetch('data/menu.json', { cache: 'no-cache' })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(data => {
      render(data);
      if (location.hash === '#drinks' || location.hash === '#cardapio') {
        requestAnimationFrame(() => menuSec.scrollIntoView());
      }
    })
    .catch(() => {
      root.innerHTML = `<div class="empty"><p class="empty-t">Não conseguimos carregar o cardápio agora.</p>
        <p>Recarregue a página ou <a href="${esc(waUrl || mapsUrl)}" target="_blank" rel="noopener">fale com a gente</a>.</p></div>`;
    });

  /* ---------- 9. Flutuantes ---------- */
  const fab = $('.fab-wa');
  const toTop = $('.fab-top');
  const onScroll = () => {
    const y = scrollY > innerHeight * .7;
    fab?.classList.toggle('show', y && !fab.hidden);
    toTop.classList.toggle('show', y);
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  toTop.addEventListener('click', () => scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }));
})();
