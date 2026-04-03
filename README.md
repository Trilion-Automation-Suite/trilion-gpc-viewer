# Trilion GPC Viewer

View GOM Product Configurator orders and quotes — no Windows app required.

Open a `.gconfiguration` file and instantly see the full order breakdown: line items, sections, article-level list and distributor prices, discounts, and totals. Works on Windows, macOS, iOS, and Android. Installable as a desktop app via any Chromium browser.

---

## Features

- Drag-and-drop, browse, or paste `.gconfiguration` files
- Full order header — order number, distributor, price list, currency, destination
- Expandable line items with per-article list price, end customer price, and distributor price
- Cmd+K / Ctrl+K command palette for searching tabs, fields, contacts, and line items
- Light / dark theme
- Installable PWA — works offline after first load
- File association — double-click `.gconfiguration` files in Explorer, Finder, or Outlook to open directly
- Supports older .gconfiguration files with embedded PDB catalogs

---

## Using the hosted app

The easiest way — no installation required beyond a browser.

1. Open **Chrome** or **Edge** and go to:
   ```
   https://trilion-automation-suite.github.io/trilion-gpc-viewer/
   ```
2. Drag a `.gconfiguration` file onto the page, or click to browse.

### Install as a desktop app (recommended)

Once installed, the app launches offline and registers as the default opener for `.gconfiguration` files — including attachments opened directly from Outlook.

1. Visit the URL above in Chrome or Edge
2. Click the **install icon** (⊕) in the address bar
3. Click **Install**

The app now appears in your Start Menu / Applications folder. Double-clicking any `.gconfiguration` file will open it directly.

### macOS — Set as default opener in Finder

After installing the PWA via Chrome:

1. Right-click any `.gconfiguration` file in Finder
2. Select **Get Info**
3. Under "Open with", select **Trilion GPC Viewer** (or **Google Chrome Apps - GPC Viewer**)
4. Click **Change All** to apply to all `.gconfiguration` files

> **Note:** File association requires Chrome or Edge. Safari does not support the File Handling API.

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| Cmd+K / Ctrl+K | Open search palette |
| Cmd+V / Ctrl+V | Paste a `.gconfiguration` file from clipboard |
| Arrow keys + Enter | Navigate search results |
| Esc | Close search palette |

---

## Local development

### Prerequisites

- Node.js 20+
- npm 10+

### Setup

```bash
git clone https://github.com/Trilion-Automation-Suite/trilion-gpc-viewer.git
cd trilion-gpc-viewer
npm install
```

### Run dev server

```bash
npm run dev
```

Opens at `http://localhost:5173`. Hot module replacement is enabled.

### Run tests

```bash
npm test                 # run once
npm run test:watch       # watch mode
npm run test:coverage    # with coverage report
```

### Lint and type-check

```bash
npm run lint             # ESLint
npx tsc --noEmit         # TypeScript
```

### Build for production

```bash
npm run build
```

Output goes to `dist/`. To preview the production build locally:

```bash
npm run preview
```

---

## Deploying your own instance

The repo includes a GitHub Actions workflow that builds and deploys to GitHub Pages automatically on every push to `main`.

### One-time setup

1. Fork or clone this repo to your GitHub organization
2. Go to **Settings → Pages → Source** and select **GitHub Actions**
3. Update `VITE_BASE` in `.github/workflows/deploy.yml` to match your repo name:
   ```yaml
   VITE_BASE: /your-repo-name/
   ```
4. Push to `main` — the deploy workflow runs automatically

Your app will be live at:
```
https://<your-org>.github.io/<your-repo-name>/
```

---

## How it works

`.gconfiguration` files are AES-128-CBC encrypted OPC/ZIP packages. The app decrypts them entirely in the browser using the WebCrypto API — no file data is ever sent to a server. The ZIP is unpacked with JSZip, and `order.xml` / `config.xml` are parsed with the browser's native DOMParser.

---

## Browser support

| Browser | Open files | Install as app | File association |
|---|---|---|---|
| Chrome 102+ | ✅ | ✅ | ✅ |
| Edge 102+ | ✅ | ✅ | ✅ |
| Safari (iOS/macOS) | ✅ | ✅ | ❌ |
| Firefox | ✅ | ❌ | ❌ |

File association (opening from Outlook / Explorer) requires the PWA to be installed in Chrome or Edge.

---

## Contributing

See [CONTRIBUTING](/.github/pull_request_template.md) for the PR checklist. Bug reports and feature requests use the issue templates in this repo.
