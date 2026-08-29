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
| `/login`       | Sign in (outside the app shell)               |
| `/signup`      | Create an account (outside the app shell)     |
| `/`            | Query — the NL→SQL console, calls the backend |
| `/history`     | Past questions and the SQL they produced      |
| `/schema`      | Tables and columns in scope                   |
| `/connections` | Databases the workspace can reach             |
| `/settings`    | Colour mode and profile                       |

Everything except `/login` and `/signup` renders inside `(app)/layout.tsx` →
`AppShell`, which supplies the navbar and sidebar and redirects to `/login`
when there is no session.

## Layout

```
src/
├── app/
│   ├── layout.tsx          fonts, ThemeProvider, SessionProvider
│   ├── globals.css         design tokens (light + dark), base styles
│   ├── login/page.tsx      sign-in
│   ├── signup/page.tsx     account creation
│   └── (app)/              route group that shares the app shell
│       ├── layout.tsx
│       └── page.tsx, history/, schema/, connections/, settings/
├── components/
│   ├── app-shell.tsx       navbar + sidebar + session guard
│   ├── navbar.tsx          brand, settings, notifications, theme, account
│   ├── sidebar.tsx         collapsible rail (desktop) + drawer (mobile)
│   ├── session-provider.tsx  loads /api/auth/me, exposes login/signup/signOut
│   ├── query-console.tsx   the NL→SQL form
│   ├── sql-block.tsx       monochrome SQL syntax emphasis
│   └── ui/                 icon-button, dropdown, avatar, page-shell, field
└── lib/
    ├── api.ts              backend client, incl. signup/login/logout/getCurrentUser
    ├── nav.ts              the sidebar tabs
    ├── motion.ts           shared transitions and variants
    ├── session.ts          sidebar preference store + the Session type
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

Auth is real, against the backend's `/api/auth/*` (see `backend/README.md`).
`session-provider.tsx` calls `GET /api/auth/me` on mount to resolve the
signed-in user from the backend's httpOnly session cookie — there is no
client-readable session state, so nothing about auth lives in `localStorage`.
`login`/`signup`/`signOut` on `useSession()` call the matching `lib/api.ts`
functions, which throw a typed `ApiError` (field-level messages for 422s, a
plain message otherwise) that the login/signup forms show inline.
