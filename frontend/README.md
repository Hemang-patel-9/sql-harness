# Frontend — Next.js

Next.js 16 (App Router) + TypeScript + Tailwind v4, with `motion` (Framer
Motion) for animation, `three` + `@react-three/fiber` for the one WebGL
object on the landing page, `lucide-react` for icons, and `next-themes` for
the colour mode.

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
| `/`            | Public landing page — hero, 3D scene, sections |
| `/login`       | Sign in (outside the app shell)               |
| `/signup`      | Create an account (outside the app shell)     |
| `/query`       | Query — the NL→SQL console, calls the backend |
| `/schema`      | Tables and columns in scope                   |
| `/connections` | Databases the workspace can reach             |
| `/settings`    | Colour mode and profile                       |

`/`, `/login` and `/signup` are public. Everything else renders inside
`(app)/layout.tsx` → `AppShell`, which supplies the navbar and sidebar and
redirects to `/login` when there is no session. Signing in lands on
`/query` — `APP_HOME` in `lib/nav.ts` is the single place that says so.

## Layout

```
src/
├── app/
│   ├── layout.tsx          fonts, ThemeProvider, SessionProvider
│   ├── globals.css         design tokens (light + dark), depth, base styles
│   ├── (marketing)/        the public landing page at /
│   ├── login/page.tsx      sign-in
│   ├── signup/page.tsx     account creation
│   └── (app)/              route group that shares the app shell
│       ├── layout.tsx
│       └── query/, schema/, connections/, settings/
├── components/
│   ├── app-shell.tsx       navbar + sidebar + session guard
│   ├── navbar.tsx          brand, notifications, theme, account
│   ├── sidebar.tsx         collapsible rail (desktop) + drawer (mobile)
│   ├── session-provider.tsx  loads /api/auth/me, exposes login/signup/signOut
│   ├── query-console.tsx   the NL→SQL form
│   ├── transcript.tsx      question types itself out, becomes SQL
│   ├── login-aside.tsx     the panel beside the sign-in form
│   ├── sql-block.tsx       monochrome SQL syntax emphasis
│   ├── marketing/          landing nav, hero, and the scroll sections
│   ├── three/query-engine.tsx  the WebGL schema object
│   └── ui/                 button, icon-button, dropdown, avatar, modal,
│                           field, page-shell, reveal, tilt-card
└── lib/
    ├── api.ts              backend client, incl. signup/login/logout/getCurrentUser
    ├── nav.ts              the sidebar tabs and APP_HOME
    ├── motion.ts           shared transitions, entrance and scroll variants
    ├── session.ts          sidebar preference store + the Session type
    └── store.ts            localStorage-backed useSyncExternalStore helpers
```

## Design notes

- **Tokens, not raw colours.** `globals.css` defines `--paper`, `--surface`,
  `--line`, `--ink`, `--muted`, `--marker`, `--wash` for light, and overrides
  them under `.dark`. Tailwind exposes them as `bg-paper`, `text-ink`, and so
  on, so a component is written once and works in both modes.
- **Amber is a marker, never a text colour.** It appears as the solid caret
  (brand, active tab, focused composer), a wash behind the active row, the
  unread dot, behind SQL literals, and on the active plate in the 3D scene.
  Everything else is a cool neutral.
- **Depth without a single gradient.** Three ingredients only: layered
  shadows (`--elev-1/2/3`), a 1px lit top edge (`--edge`, applied through
  `--elev-inset`), and pattern grounds — a dot field (`.dot-field`), an
  engineering grid (`.grid-field`) and a film grain on `body::after`. The
  card recipes `.panel`, `.panel-raised` and `.panel-float` combine them, so
  elevation is chosen by name rather than re-typed as a shadow value. The
  only `*-gradient()` calls in the codebase are `mask-image` falloffs, which
  paint no colour.
- **Two faces, two jobs.** Instrument Sans for prose and UI, IBM Plex Mono for
  identifiers, SQL, labels, and numbers.
- **Motion is functional.** The active-tab caret travels between tabs with a
  shared `layoutId`; the sidebar animates its width; menus scale from their
  own corner. On the landing page, sections settle in as they scroll into
  view (`ui/reveal.tsx`) and cards lean towards the pointer in real 3D
  (`ui/tilt-card.tsx`, on a shared `.stage` perspective).
  `prefers-reduced-motion` is respected globally, and both `Reveal` and
  `TiltCard` render their plain final state under it.

## The 3D scene

`components/three/query-engine.tsx` is the only WebGL in the project: the
schema as an object — a stack of discs for the database, thin plates for
tables, curved lines for joins, and one amber signal travelling out to a
different table every 1.75s. It is imported through `next/dynamic` with
`ssr: false`, so it never reaches the server and never blocks the hero copy.
Its palette is hex-duplicated from `globals.css` because a WebGL material
cannot read a CSS custom property — if the tokens move, move those too. Under
`prefers-reduced-motion` the canvas switches to `frameloop="demand"` and
holds a single still frame.

## Session

Auth is real, against the backend's `/api/auth/*` (see `backend/README.md`).
`session-provider.tsx` calls `GET /api/auth/me` on mount to resolve the
signed-in user from the backend's httpOnly session cookie — there is no
client-readable session state, so nothing about auth lives in `localStorage`.
`login`/`signup`/`signOut` on `useSession()` call the matching `lib/api.ts`
functions, which throw a typed `ApiError` (field-level messages for 422s, a
plain message otherwise) that the login/signup forms show inline.
