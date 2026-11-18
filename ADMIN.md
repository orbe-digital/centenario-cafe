# Painel do cardápio (`/admin`)

O cardápio fica em `data/menu.json`. O painel em `/admin/` edita esse arquivo e
faz um commit no repositório pela API do GitHub. O GitHub Pages republica o
site sozinho em 1 a 2 minutos. Não há nenhum servidor ou serviço externo.

## Como funciona o login

- `admin/users.json` guarda, para cada usuário, uma cópia do **token do GitHub
  cifrada com a senha dele** (PBKDF2-SHA256 com 600 mil iterações + AES-256-GCM).
- No login, o navegador decifra o token com a senha e passa a usá-lo para gravar.
  O token fica só na aba aberta (`sessionStorage`) e some ao fechá-la.
- O arquivo `users.json` é público junto com o site. Por isso, **use senhas
  longas** (o script exige 12 caracteres ou mais; uma frase é ótima).

## Configuração inicial (uma vez)

1. **Crie o token** em GitHub → Settings → Developer settings →
   Personal access tokens → **Fine-grained tokens** → *Generate new token*:
   - **Resource owner:** `orbedigital-sites`
   - **Repository access:** *Only select repositories* → `centenario-cafe`
     (não use *Public repositories*: essa opção é somente leitura e o painel
     dá erro 403 ao publicar)
   - **Permissions → Repository permissions → Contents:** *Read and write*
   - **Expiration:** até 1 ano (anote a data para renovar).
2. **Crie o usuário** na raiz do projeto (precisa de Node 18 ou mais novo):
   ```bash
   node tools/admin-user.mjs add centenario
   ```
   O script pede a senha (duas vezes) e o token, confere se o token tem acesso
   ao repositório e grava `admin/users.json`.
3. **Publique:**
   ```bash
   git add admin/users.json && git commit -m "Painel: usuário centenario" && git push
   ```
4. Acesse `https://<seu-site>/admin/`.

## Tarefas do dia a dia

| Tarefa | Como |
| --- | --- |
| Novo usuário ou troca de senha | `node tools/admin-user.mjs add <usuario>`, depois commit e push |
| Remover um usuário | `node tools/admin-user.mjs remove <usuario>`, depois commit e push. Se a pessoa pode ter guardado o token, revogue-o no GitHub e recadastre os outros usuários com um token novo |
| Listar usuários | `node tools/admin-user.mjs list` |
| Token expirou (o painel avisa) | Gere um token novo e rode `add` de novo para cada usuário |
| Desfazer uma alteração | Cada publicação é um commit com o nome do usuário: `git revert <commit>` ou pelo histórico do GitHub |

## O que o painel faz

- **Dois cardápios:** cada categoria pertence a *Pratos & Bebidas* ou a *Drinks*
  (campo "Cardápio"); o menu lateral mostra as categorias separadas por cardápio.
- **Categorias:** criar, renomear, reordenar, ocultar, excluir, observação
  (ex.: "Taxa de rolha") e foto.
  - *Foto em arco:* foto normal, salva em JPEG (até 1000 px).
  - *Recorte:* para imagens com fundo transparente (como a xícara de cappuccino),
    salva em PNG mantendo a transparência.
- **Cards com foto** (como na carta de drinks): marque a opção na categoria e
  cada produto ganha um campo de foto próprio.
- **Seções** dentro da categoria (ex.: "Tapiocas", "Argentina"), com observação
  e opção de lista compacta.
- **Produtos:** nome, preço, descrição, selo ("da casa", "zero álcool"…),
  variações (pequeno/grande, dose/clube), ocultar quando esgotado e reordenar.
- **Busca rápida** nos dois cardápios, com troca de preço direto na lista de resultados.
- Validação antes de publicar (nome e preço no formato `49,90`).
- Rascunho salvo no navegador, para não perder edições não publicadas.
- Se duas pessoas publicarem ao mesmo tempo, o painel detecta e pergunta o que fazer.

Contatos, endereço e horário não ficam no painel: edite `js/config.js`.

## Testar localmente

```bash
python3 -m http.server 8000   # http://localhost:8000 e http://localhost:8000/admin/
```

No painel local, as alterações gravam de verdade no GitHub.
