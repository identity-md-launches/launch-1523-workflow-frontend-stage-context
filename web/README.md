# PixelCommons frontend

A static React + TypeScript frontend for the deployed PixelCommons contract. Anyone can watch the 64×64 canvas; a browser wallet can paint one of 16 colors once every 30 seconds. This worker builds the site and records validation. Hosting, source publication, naming and IPFS pinning happen later.

## Install, run and rebuild

Use Node.js 24 and npm. From the repository root:

```sh
cd web
npm ci
npm run dev
```

`npm run dev` generates development copies of the runtime manifest and ABI under `web/public/`. Those copies are ignored by `web/.gitignore`. All dependencies and lockfiles live under `web/`; neither `node_modules` nor caches belong in the submission. On a machine with a read-only npm home, add `--cache /tmp/pixelcommons-npm-cache` to `npm ci`.

```sh
cd web
npm run typecheck
npm run build
npm run verify
npm run preview
```

The build writes repository-root `dist/`, exports the ABI from the pinned Git commit, and **generates `dist/imd-deployment.json` last**. Commit the complete export alongside source and the lockfile. Never edit an exported file without rebuilding its manifest. `npm run verify` checks the exact schema, all deployment identifiers, contract set, ABI binding, inventory, hashes, network data, safe relative paths and size limits.

For a gateway-style preview, `node scripts/serve.mjs` prints a local URL ending in `/preview/`. It serves only the export and shuts down after 45 minutes. The production site requires HTTPS static hosting; no server process or backend is part of the deployment. Vite's `base: './'` and the single page support gateway subpaths without rewrites.

## Configuration and ABI provenance

The browser reads **one runtime configuration**: `dist/imd-deployment.json`. `src/config.ts` loads it, fetches each referenced raw ABI array and verifies its canonical Keccak hash. There is no compiled address, chain or RPC map. Contract links, wallet network requests, public reads and signing all derive from this file.

`deployment/handoff.json` and `deployment/network.json` are preserved build inputs copied from the supplied handoff. They are not imported into browser code. The export script reads `docs/abi/<Contract>.json` using `git show <sourceCommit>:<path>` and verifies the hash before exporting. Keep the pinned source commit in the repository's Git history. No `.imd/` file is required to rebuild; when the original inputs are present, the verification script additionally compares them with the saved copies.

Canonical ABI hashing recursively sorts object keys, preserves array order, serializes without whitespace, UTF-8 encodes, then applies Keccak-256. Asset hashes use SHA-256 on exact final bytes. The manifest excludes itself. Network and optional `walletAddChain` are copied unchanged. A supplied `poolKey` is preserved by the exporter, although this deployment has no token or pool and the app has no swap or approval actions.

## Wallets and transaction behavior

- EIP-6963 browser-wallet discovery plus legacy EIP-1193 injection; no WalletConnect project ID, API key, custodian, private key or backend is needed. Mobile visitors can open the page inside a wallet browser. Standalone mobile browsers without an injected wallet receive an explanation. WalletConnect is not configured.
- Unknown networks use `wallet_switchEthereumChain`, then `wallet_addEthereumChain` with the exact supplied parameters on error 4902 or an unknown-chain message, followed by another switch.
- Viewing and polling work disconnected. The connected account, its balance and `nextPaintAt` are read at the same block as the canvas. Account and chain change events invalidate eligibility. Full checksummed addresses have explorer links and copy controls; no ENS resolver is assumed.
- Select a color and pixel, review the coordinate and replacement, then press **Paint pixel**. Pixel selection itself never sends a transaction. Arrow keys and Enter work on the canvas; exact row/column inputs provide an equivalent large-target control on touch devices.
- Before signing, the app checks RPC chain ID, nonempty code and all canvas constants, simulates `paint`, then rechecks the wallet account and chain. It sends no ETH value. Only network gas is charged, in Sepolia test ETH; no USD price source is available.
- A synchronous submission guard prevents duplicate sends. Pending remains locked through receipt confirmation. Reverted, cancelled/replaced, declined and uncertain outcomes have distinct messages. An unconfirmed hash is saved in session storage for that tab; **Check confirmation** recovers after reload. Storage restrictions can prevent this optional recovery. A transaction that was never accepted or remains pending must be inspected in the wallet/explorer; the app does not assume a timeout means failure.
- Confirmed pixels are reloaded from chain state, rather than invented locally. The countdown estimates time from the latest block; the action stays disabled until observed chain time reaches `nextPaintAt`.

## Reads, refreshes and activity

Public RPC URLs come exclusively from the network block, in its supplied order. Viem falls back through those URLs and then, when connected on the expected chain, the wallet's provider. An 8-second timeout bounds each public attempt. The app verifies chain ID and contract code before exposing a ready state.

Visible tabs refresh every 4 seconds, with no overlapping canvas refresh. Background polling pauses, and returning to the page refreshes state. Data older than 20 seconds, failed verification, missing code, or a failed account read disables painting. The last known canvas stays visible with an out-of-date/interrupted label.

The feed reads only `Painted` events from the configured contract, orders by block and log index, deduplicates, and retains the latest 20. It replaces a 12-block overlap to handle shallow reorganizations. Initial history scans backwards in 2,000-block windows and checks historical code to detect the contract's birth, avoiding a second deployment-block configuration. Range-limit errors split requests down to bounded chunks. Until complete, the UI says it is searching older blocks; RPC failures are visible and retryable. A sparse old deployment or a provider without historical code support can delay/interrupt history completion. No indexer, sample activity or browser-local shared canvas is used.

## Validation

```sh
cd web
npm test
npm run verify:live
npx playwright install chromium webkit
npm run test:browser
```

`npm test` covers canonical hashes, path validation, byte decoding, coordinates, error translation, event ordering/history/reorganization handling and transaction verification gates. Browser tests serve the **built export at `/preview/`**, mock RPC and EIP-1193 wallets, and exercise Chromium plus WebKit without real funds. They record JSON and clearly named mocked screenshots under `docs/frontend-evidence/`. `verify:live` performs read-only checks against all configured public RPCs and records code, state, constants, deployment-block checks and the factory receipt's attestation.

If browsers are installed outside the default cache, set `PLAYWRIGHT_BROWSERS_PATH`. A worker-specific WebKit launcher can be passed as `PIXELCOMMONS_WEBKIT_EXECUTABLE`; it is only a test option and is never bundled. Linux browser dependencies may need installation. The worker used temporary extracted libraries and a launcher under `test/scratch/`; neither is a shipped dependency.

When the pinned probe is present, run from the repository root:

```sh
IMD_PLAYWRIGHT="$PWD/web/node_modules/playwright/index.mjs" \
  node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste
```

See [validation and limitations](../docs/FRONTEND_VALIDATION.md), [the implemented design](../docs/DESIGN.md), and [validation evidence](../docs/frontend-evidence/). Social metadata uses the local `share.png`; absolute social URLs can be set after the publisher supplies the final domain. Re-export and re-hash if metadata changes.

## Scope and attribution

`docs/DESIGN.md` intentionally replaces the requested root location because the assignment permits only `web/**`, `dist/**` and `docs/**` (plus explicitly budgeted `web/.gitignore`). The root contracts, Foundry configuration, remappings, libraries and workflows remain unchanged.

Design guidance: Jakub Krehel's Better Interface, MIT, pinned commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`. Documentation method: Paul Bakaus's Impeccable, Apache-2.0, commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`, adapted to describe this implementation. Ethereum UX guidance: Austin Griffith's ethskills, MIT, commit `06ea4efa08076ff04f6ca4945ef4a2ca881115b0`. Notices and licenses are included under `docs/frontend-evidence/`.

Viem's [simulation](https://viem.sh/docs/contract/simulateContract) and [wallet write](https://viem.sh/docs/contract/writeContract) documentation informed the simulate-then-sign flow. The page uses original code-drawn branding, with no external art or fonts.
