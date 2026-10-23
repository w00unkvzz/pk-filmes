# w00filmes

Streaming com catálogo próprio, login real, amigos e salas de watch party
sincronizadas. Frontend estático (HTML/CSS/JS) + **Supabase** para autenticação,
banco, Realtime e Storage. Deploy no **Vercel**.

## Recursos

- Catálogo próprio carregado de `catalog.json`.
- Player para MP4/WebM/OGV/MOV e iframe (YouTube, Vimeo etc.).
- Login, cadastro, recuperação de senha e sessão persistente via Supabase Auth.
- Perfil com foto ou GIF enviado para o bucket `avatars` do Supabase.
- Amigos reais: busca por nome/e-mail, pedidos, aceite, recusa e remoção.
- **w00 Party** com salas públicas/privadas, código, convites e chat persistente.
- Reprodução sincronizada: só o anfitrião controla play/pause/seek. Os convidados
  recebem o estado em tempo real e o player corrige atraso automaticamente.
- Sem botão de “sincronizar”.
- Layout responsivo, preto com painéis rosa translúcidos.
- Lista e histórico continuam locais; perfil, foto, amigos, salas e chat usam Supabase.

## Páginas

`index.html` · `catalogo.html` · `cartaz.html` ·
`pkparty.html` · `amigos.html` · `mascote.html` · `perfil.html`

## 1. Supabase

No **SQL Editor**, execute nesta ordem:

1. [`supabase/schema.sql`](supabase/schema.sql) — perfis, lista, histórico, amizades, salas e mensagens.
2. [`supabase/002_social.sql`](supabase/002_social.sql) — avatar, convites de sala, RPCs de amigos/salas e colunas de sincronização.

O segundo arquivo é idempotente e pode ser executado novamente.

### Configuração do frontend

[`js/supabase-config.js`](js/supabase-config.js) já contém a URL e a `anon key`
do projeto. A `anon key` é pública por design; a proteção vem do RLS.
**Nunca** coloque a `service_role key` no frontend.

### Autenticação

Em **Authentication → URL Configuration**:

- **Site URL**: `https://SEU-DOMINIO`
- **Redirect URLs**:
  - `http://127.0.0.1:4173`
  - `http://localhost:4173`
  - `https://SEU-DOMINIO`
  - `https://SEU-DOMINIO/perfil.html`

O cadastro está com confirmação de e-mail desativada para testes. Antes de abrir
ao público, configure SMTP e reative a confirmação.

### GitHub OAuth (opcional)

1. Crie um OAuth App no GitHub.
2. Callback: `https://SEU-PROJETO.supabase.co/auth/v1/callback`.
3. Ative o provider GitHub no Supabase.
4. Em `js/supabase-config.js`, mude `githubOAuth: false` para `true`.

## 2. Rodar localmente

```bash
cd pk_filmes_demo
bash serve.sh
# http://127.0.0.1:4173
```

Não abra via `file://`: catálogo, módulos ES e Supabase precisam de HTTP.

## 3. Catálogo

Edite `catalog.json`:

```json
{
  "items": [
    {
      "nome": "Nome do filme",
      "capa": "https://image.tmdb.org/t/p/w500/capa.jpg",
      "categoria": "Ação",
      "idade": "14",
      "player": "https://.../filme.mp4"
    }
  ]
}
```

Opcionais: `ano`, `tipo`, `sinopse`, `duracao`, `nota`, `generos`, `destaque`,
`tendencia`, `top10`, `novo`, `elenco`, `direcao`, `trailer`.

Para o modo sincronizado do w00 Party, use link direto de vídeo (`.mp4`,
`.webm`, `.ogv`, `.mov`). Players incorporados continuam funcionando, mas não
podem ser controlados pelo anfitrião por serem de outro domínio.

## 4. Deploy

O projeto é estático, sem build.

- Framework preset: **Other**
- Build command: vazio
- Output directory: `.`
- `vercel.json` já define URLs limpas e headers.

## 5. Estrutura

```text
catalog.json              catálogo do operador
css/theme.css             tema preto + rosa translúcido
js/social.js              amigos, salas, chat, convites e avatar
js/supabase.js            cliente, auth e perfil
js/auth.js                sessão Supabase ↔ estado local
js/store.js               cache local (usuário, lista, histórico, mascote)
js/ui.js                  shell, cards, modais, player e login
js/pages/pkparty.js       lobby, sala, chat e sincronização do player
js/pages/amigos.js        busca e amizades reais
js/pages/perfil.js        perfil, upload de foto/GIF, lista e histórico
supabase/schema.sql       001 — base
supabase/002_social.sql   002 — social/realtime/avatar
```

## 6. Segurança

- RLS ativo em perfis, amizades, salas, membros, convites e mensagens.
- Apenas o anfitrião pode atualizar o estado de reprodução da sala.
- Convites de sala e amizades são validados por funções `SECURITY DEFINER`.
- Upload de avatar só é permitido dentro da pasta do próprio usuário.
- Para produção: confirmação de e-mail, SMTP próprio, rate limits e rotação
  das chaves usadas no deploy.
