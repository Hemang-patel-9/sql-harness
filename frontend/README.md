# Frontend — Next.js

Next.js 16 (App Router) + TypeScript + Tailwind v4, with `motion` (Framer
Motion) for animation, `lucide-react` for icons, and `next-themes` for the
colour mode.

## Run

```bash
npm install
npm run dev      # http://localhost:3000
```

The API base URL comes from `.env.local`:

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

The backend's CORS allowlist is set to `http://localhost:3000`. If you run the
frontend on another port, add it to `CORS_ORIGINS` in `backend/.env`.

## Routes

| Route          | What it is                                    |
| -------------- | --------------------------------------------- |
| `/login`       | Demo sign-in (outside the app shell)          |
| `/`            | Query — the NL→SQL console, calls the backend |
| `/history`     | Past questions and the SQL they produced      |
| `/schema`      | Tables and columns in scope                   |
| `/saved`       | Kept queries                                  |
| `/connections` | Databases the workspace can reach             |
| `/settings`    | Colour mode and profile                       |

Everything except `/login` renders inside `(app)/layout.tsx` → `AppShell`,
which supplies the navbar and sidebar and redirects to `/login` when there is
no session.

## Layout

```
src/
├── app/
│   ├── layout.tsx          fonts, ThemeProvider, SessionProvider
│   ├── globals.css         design tokens (light + dark), base styles
│   ├── login/page.tsx      sign-in
│   └── (app)/              route group that shares the app shell
│       ├── layout.tsx
│       └── page.tsx, history/, schema/, saved/, connections/, settings/
├── components/
│   ├── app-shell.tsx       navbar + sidebar + session guard
│   ├── navbar.tsx          brand, settings, notifications, theme, account
│   ├── sidebar.tsx         collapsible rail (desktop) + drawer (mobile)
│   ├── query-console.tsx   the NL→SQL form
│   ├── sql-block.tsx       monochrome SQL syntax emphasis
│   └── ui/                 icon-button, dropdown, avatar, page-shell
└── lib/
    ├── api.ts              backend client
    ├── nav.ts              the sidebar tabs
    ├── motion.ts           shared transitions and variants
    ├── session.ts          demo session + sidebar preference stores
    └── store.ts            localStorage-backed useSyncExternalStore helpers
```

## Design notes

- **Tokens, not raw colours.** `globals.css` defines `--paper`, `--surface`,
  `--line`, `--ink`, `--muted`, `--marker`, `--wash` for light, and overrides
  them under `.dark`. Tailwind exposes them as `bg-paper`, `text-ink`, and so
  on, so a component is written once and works in both modes.
- **Amber is a marker, never a text colour.** It appears as the solid caret
  (brand, active tab), a wash behind the active row, the unread dot, and
  behind SQL literals. Everything else is a cool neutral.
- **Two faces, two jobs.** Instrument Sans for prose and UI, IBM Plex Mono for
  identifiers, SQL, labels, and numbers.
- **Motion is functional.** The active-tab caret travels between tabs with a
  shared `layoutId`; the sidebar animates its width; menus scale from their
  own corner. `prefers-reduced-motion` is respected globally.

## Session

Sign-in is a demo: `lib/session.ts` writes `{ name, email }` to
`localStorage` and nothing is verified. Replace `sessionStore` with real auth
calls when the backend grows an `/api/auth` surface.
