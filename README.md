# DEFENDER — Browser arcade tribute

A browser-based, unofficial tribute to the classic side-scrolling arcade game, built with React, Canvas 2D and the Web Audio API. All sprites, terrain and sound effects in this implementation are generated in code.

**Not affiliated with or endorsed by the owners of the original Defender game or its trademarks.**

## Requirements

Node.js 20.19+ or 22.12+ (Node.js 22 LTS recommended).

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run preview
```

## Cloudflare Workers auto-deployment

The repository includes `wrangler.jsonc` configured for Cloudflare Workers static assets. No server, database, environment secrets or external game assets are needed.

1. In [Cloudflare Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages), select **Create application** → **GitHub**.
2. Authorise access to `mistyislesoftware/defender` if requested, then select the `main` branch.
3. Use Worker name **`defender`** (must match `wrangler.jsonc`). Project root: repository root `/`.
4. Build command: **`npm run build`**. Deploy command: **`npx wrangler deploy`**.
5. Save and deploy. Test the `*.workers.dev` address.
6. Under Worker **Settings → Domains & Routes → Add → Custom Domain**, use **`defender.mistyislesoftware.co.uk`**.

Once the GitHub integration is connected, commits to `main` trigger Cloudflare builds and deployments automatically.

## How to play

The game is currently designed for a **keyboard**. Click the game and press **Enter** to start. Arrow keys control direction and elevation, **Space** fires, **B** triggers a smart bomb, and **H** activates hyperspace. Press **O** for display settings, **P** to pause, **F** for fullscreen and **M** for sound.

There are no on-screen touch controls in the supplied version, so playing on a phone without an external keyboard is not supported yet. The page still renders at mobile sizes.

## Source and licensing

Game source: `src/Defender.jsx`. The source is published for viewing; no open-source licence is granted unless the repository owner adds one.
