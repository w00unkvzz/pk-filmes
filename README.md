# PK Filmes

Clone funcional do catálogo de streaming, com login real via Supabase, player
por URL e deploy estático no Vercel.

## O que já está pronto

- 10 páginas estáticas: início, catálogo, busca, em breve, PK Party, amigos,
  VIP, mascote, perfil e onboarding.
- Catálogo carregado de `catalog.json` (schema próprio, sem backend).
- Player para MP4/WebM/OGV/MOV e iframe (YouTube, Vimeo, etc.).
- Login e criação de conta com e-mail/senha via Supabase.
- Login OAuth com GitHub (opcional, configurado no Supabase).
- Perfil persistido em `public.profiles`.
- Sessão restaurada automaticamente e sincronizada entre abas.
- Modo local automático enquanto o Supabase não estiver configurado.
- SQL completo com RLS para perfis, lista, histórico, amizades e salas.

## 1. Configurar o Supabase

1. Crie um projeto em <https://supabase.com/dashboard>.
2. Abra **SQL Editor → New query**, cole o conteúdo de
   [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.
3. Abra **Project Settings → API** e copie:
   - **Project URL** (ex.: `https://abcd1234.supabase.co`)
   - **anon public key**
4. Preencha [`js/supabase-config.js`](js/supabase-config.js):

```js
export const SUPABASE_CONFIG = {
  url: "https://SEU-PROJETO.supabase.co",
  anonKey: "SUA_ANON_KEY",
  redirectTo: ""
};
```

A `anon key` é pública por design. Quem protege os dados é o RLS do schema.
**Nunca** coloque a `service_role key` no frontend.

## 2. Configurar autenticação

Em **Authentication → URL Configuration**:

- **Site URL**: `https://SEU-DOMINIO.vercel.app`
- **Redirect URLs**:
  - `http://127.0.0.1:4173`
  - `http://localhost:4173`
  - `https://SEU-DOMINIO.vercel.app`
  - `https://SEU-DOMINIO.vercel.app/perfil.html`

Em **Authentication → Providers → Email**:

- Ative **Enable Email provider**.
- Para testar sem caixa de entrada, desative **Confirm email**.
- Para produção, mantenha a confirmação ativada.

### Login com GitHub (opcional)

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. **Homepage URL**: `https://SEU-DOMINIO.vercel.app`
3. **Authorization callback URL**:
   `https://SEU-PROJETO.supabase.co/auth/v1/callback`
4. Copie **Client ID** e **Client Secret** para
   **Supabase → Authentication → Providers → GitHub**.
5. Ative o provider.

O botão “Continuar com GitHub” já está na tela de login.

## 3. Rodar localmente

```bash
cd pk_filmes_demo
./serve.sh
# http://127.0.0.1:4173
```

Não abra os HTMLs com `file://`; o catálogo e o Supabase precisam de HTTP.

## 4. Catálogo

Edite `catalog.json`. Campos obrigatórios:

```json
{
  "items": [
    {
      "nome": "Nome do filme",
      "capa": "https://.../capa.jpg",
      "categoria": "Ação",
      "idade": "14",
      "player": "https://.../filme.mp4"
    }
  ]
}
```

Opcionais: `ano`, `tipo` (`filme` ou `serie`), `sinopse`, `duracao` (minutos),
`nota`, `generos`, `destaque`, `tendencia`, `top10`, `novo`, `elenco`,
`direcao`, `trailer`.

Capas do TMDB podem ser usadas no formato
`https://image.tmdb.org/t/p/w500/CAMINHO.jpg`.

## 5. Deploy no Vercel

O projeto é 100% estático, sem build.

1. Suba o repositório no GitHub.
2. Em <https://vercel.com/new>, importe o repositório.
3. Framework preset: **Other**.
4. Build command: vazio.
5. Output directory: `.` (raiz do projeto).
6. Deploy.

O arquivo `vercel.json` já configura URLs limpas e headers básicos.

## 6. Estrutura

```text
catalog.json              catálogo
index.html                início
catalogo.html             catálogo
search.html               busca
cartaz.html               em breve
pkparty.html              watch party
amigos.html               amigos
vip.html                  planos
mascote.html              mascote
perfil.html               perfil
onboarding.html           tour
css/                      estilos
js/config.js              marca, navegação, planos, gêneros
js/data.js                loader e normalização do catálogo
js/store.js               estado local
js/ui.js                  shell, cards, modais, player, auth
js/auth.js                ponte Supabase ↔ estado local
js/supabase.js            cliente, auth e perfil
js/supabase-config.js     URL + anon key
js/vendor/supabase.js     SDK vendorizado
supabase/schema.sql       tabelas, RLS, triggers
serve.js / serve.sh       servidor local
vercel.json               configuração de deploy
```

## 7. Segurança

- RLS ativo em todas as tabelas.
- Perfis só podem ser lidos/escritos pelo próprio usuário.
- Lista e histórico são privados por usuário.
- Amizades e salas têm policies por participante.
- A `anon key` pode ficar pública; a `service_role key` nunca.
- Para produção, mantenha a confirmação de e-mail ativada e configure
  Rate Limits no Supabase.

## 8. Próximos passos

- Ligar lista, histórico, amigos e salas ao Supabase (o schema já está pronto).
- Upload de avatar no bucket `avatars`.
- Página de redefinição de senha (`/perfil.html` após o link).
- Player HLS para arquivos `.m3u8` (hoje o navegador decide o suporte).
