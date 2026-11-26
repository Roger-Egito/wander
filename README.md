# Wander

Tools for Wander, a 2d10 tabletop RPG I'm designing: an Editor for the game's content,
and the app players will use for skill trees, the compendium and character sheets.

Wander is in playtest, and so is this project. Versions stay at `0.x` and end in `-beta`
until that changes.

## How it works

The game's content (skills, conditions, Facilidades e Complicações, keywords) lives in a
Google Sheet, Wander Data. The Editor reads and writes it through the Sheets API, so the
sheet stays the single source of truth and can still be edited by hand. Accounts and
profiles live in Supabase, whose migrations are in
[egito-backend](https://github.com/Roger-Egito/egito-backend). Players will only ever see
published snapshots of the content.

Every content type is declared once (`packages/content/src/types.ts`). The Editor's
forms, the validation rules, the sheet's Validation tab formula and the TypeScript types
of a loaded row are all generated from that declaration, so adding a content type is
mostly one entry there.

## Layout

| Folder | What it is |
| --- | --- |
| `packages/content` | The sheet's tabs and columns, the content types, validation |
| `packages/rules` | Game rules: costs and requirements as text, what a character can take |
| `packages/ui` | React components: theme, language, cards, keyword popovers, skill tree |
| `app` | The Vite app: Editor, gallery, Google sign-in, the Sheets adapter |
| `sheet-script` | Apps Script bound to Wander Data: IDs for rows typed by hand, backups |
| `tools/migration` | The one-time import from the old character sheet spreadsheet |
| `tools/snapshot` | Turns an .xlsx export of Wander Data into local data for development |

## Running it

Node 24 or newer.

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # every package's tests
npm run typecheck
npm run build
```

Node runs the TypeScript directly (type stripping), so nothing is compiled except the
app, which Vite builds.

To work on the app with real content before signing in to Sheets, export Wander Data as
.xlsx and run `npm run snapshot -- "path/to/Wander Data.xlsx"`. The result goes to
`app/dev-data/`, which is never committed.

## One-time setup

**Supabase.** The database (profiles, the Alpha group's bucket and their Row Level
Security) lives in [egito-backend](https://github.com/Roger-Egito/egito-backend), which
Wander shares with my portfolio's admin panel. Its README covers pushing the migrations,
making an account admin and adding someone to the Alpha group.

**Sheet script.** Log in with `npx @google/clasp login`, turn on the Apps Script API in
your Google account, then push with `npm run push -w sheet-script`. In the sheet, run
"Wander > Ativar backup semanal" once.

## License

The code is under the MIT License (see `LICENSE`).

Wander's game content (rules text, skills, conditions, Facilidades e Complicações,
keywords and their descriptions) is not covered by that license. It's © Roger Egito, all
rights reserved. Content adapted from other games keeps the terms of its source.
