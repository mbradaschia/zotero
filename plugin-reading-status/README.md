# Reading Status & Kanban — Zotero plugin

Adds a **Reading Status** field (Unread / In Progress / Done / Abandoned) to
every Zotero item, plus a **Kanban Board** tab that buckets items by status
and supports drag-and-drop between columns.

Status is stored in the existing `extra` field as a structured
`Reading-Status: <value>` line (same pattern as `Citation Key`), so it
syncs natively with no schema migration and survives BBT and other
extra-field consumers.

## Features

- Item-pane **Reading Status** row, editable inline.
- Sortable **Reading Status** column in the items table (added via the column
  picker submenu).
- Right-click an item → **Set Reading Status** → choose a value (or clear).
- **View → Open Kanban Board** opens a new tab with five columns (No status,
  Unread, In Progress, Done, Abandoned) showing items from the currently
  selected collection / library.

## Install

The prebuilt XPI is committed as base64 (`dist/zotero-reading-status.xpi.b64`).
From any terminal:

```bash
curl -L -o zotero-reading-status.xpi.b64 \
  https://raw.githubusercontent.com/mbradaschia/zotero/claude-plugin-reading-status/plugin-reading-status/dist/zotero-reading-status.xpi.b64
base64 -d zotero-reading-status.xpi.b64 > zotero-reading-status.xpi
```

Then in Zotero: **Tools → Plugins**, drag the `.xpi` onto the Plugins window,
restart.

Compatible with Zotero 7.0 through 9.0.x.

## Development

```bash
npm test         # node --test, storage-helper unit tests
npm run lint     # eslint
npm run build    # produce dist/zotero-reading-status.xpi
npm run link -- /path/to/zotero-dev-profile
```

After `npm run link`, set in the dev profile's `prefs.js` (Zotero closed):

```
user_pref("xpinstall.signatures.required", false);
user_pref("extensions.autoDisableScopes", 0);
user_pref("extensions.experiments.enabled", true);
```

Launch Zotero with `-purgecaches`. After any code edit, quit and relaunch
(still with `-purgecaches`) to pick up the changes.

## Layout

```
manifest.json            WebExtensions manifest
bootstrap.js             Zotero bootstrap entry (startup / shutdown / window hooks)
content/
  main.mjs               registers info row, column, menus, stylesheet
  readingStatus.js       extra-field storage helpers
  kanbanTab.js           Kanban tab content (vanilla DOM, drag-and-drop)
  icons/icon-32.svg
locale/en-US/
  reading-status.ftl     all plugin strings
styles/kanban.css        Kanban board styles
scripts/
  build.sh               package into dist/zotero-reading-status.xpi
  dev-link.sh            write proxy file into a Zotero dev profile
test/
  readingStatus.test.js  storage-helper unit tests (node --test)
```

## Notes

- The Kanban tab type isn't registered with Zotero's tab-type system, so open
  Kanban boards do **not** persist across restarts. Open a new one each
  session via View → Open Kanban Board.
- The plugin ID `reading-status@placeholder` is provisional. After it changes
  before release, any installed copy needs a fresh install (no auto-upgrade).
