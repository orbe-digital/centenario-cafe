# Centenário Café — site

Site estático (HTML, CSS e JS puros, sem build) com link na bio, dois cardápios (Pratos & Bebidas / Drinks), galeria e contato.
Funciona no GitHub Pages, Netlify ou Vercel. Para testar localmente: `python3 -m http.server` e abra http://localhost:8000.

| Arquivo | O que editar |
|---|---|
| `js/config.js` | WhatsApp, telefone, Instagram, link de avaliação, endereço e horário |
| `data/menu.json` | Cardápio: categorias (`group: "pratos"` ou `"drinks"`), blocos e itens |
| `assets/img/` | Fotos (WebP) usadas nas categorias, na galeria e nos cards de drinks |

Item do cardápio: `{ "name", "price": "00,00", "desc"?, "tag"?, "img"?, "hidden"?, "variants"?: [{ "label", "price" }] }`.
Categoria com `"layout": "cards"` vira grade de cards com foto (usado nos drinks).

## Painel do cardápio

Em `/admin/` há um painel para editar o `data/menu.json` sem mexer em código (preços, produtos, fotos, categorias).
Ele grava direto no repositório pela API do GitHub. A configuração inicial e o uso estão em [ADMIN.md](ADMIN.md).
