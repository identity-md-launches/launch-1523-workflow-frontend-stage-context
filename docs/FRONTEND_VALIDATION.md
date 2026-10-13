# PixelCommons frontend validation

Worker validation, 2026-10-13. This is the builder's evidence, not an independent certification. Source is under `web/`, the complete static export under `dist/`, and evidence under `docs/frontend-evidence/`.

| Area | Final result |
| --- | --- |
| Required frontend behavior | Implemented; requirement coverage below |
| Build / TypeScript | Passed |
| Logic tests | 8 passed |
| Browser interaction scenarios | 9 passed across Chromium and WebKit |
| Product and action on first 390×844 screen | Yes; action bottom 811.69px, gas note bottom 840.69px |
| Pinned taste@1 probe | 16/16 passed |
| Manifest, ABI and exported file hashes | Passed, exact handoff/network comparison |
| Public RPC read-only checks | All 3 configured Sepolia endpoints passed |
| Dependency audit | 0 known vulnerabilities reported after dependency fixes |
| Missing / fabricated frontend behavior | None identified in the checked scope |
| Publication and live wallet transactions | Not performed; publication is a subsequent stage |

## Scope, assumptions and requirement coverage

The handoff is an application-contract deployment with no token, pool, owner or initialization settings. The interface implements `paint`, all relevant views, and a real `Painted` event feed. No swaps, token approvals, ownership controls, contract redeployment or publishing were added. The palette's non-white RGB values and the light paper-like interface are ordinary frontend design choices; index 0 is white as required. The app uses injected browser wallets because no WalletConnect project ID was supplied.

| Requirement | Status and evidence |
| --- | --- |
| “a shared 64x64 pixel canvas” and “large and crisp” | Met: 64×64 native canvas, nearest-neighbor CSS rendering, optional grid; live screenshots and byte-decoding test. |
| “Anyone can look without a wallet” | Met: public RPC reads run disconnected; Chromium and WebKit screenshots/tests. |
| “pick one of the 16 colors, click a pixel to paint it” | Met: all 16 named swatches, pointer selection, coordinate inputs and keyboard selection; explicit Paint confirmation before wallet signing. Encoded transaction args checked in both engines. |
| “one paint per wallet every 30 seconds” and countdown | Met: account-specific `nextPaintAt`, chain-time countdown, disabled cooldown and fresh eligibility checks; simulated cooldown and confirmation tests. |
| “refreshed every few seconds” | Met: 4-second visible-tab polling, visibility resume and manual refresh, no overlapping canvas refresh; refreshed pixels read from contract. |
| “latest 20 paints (who, where, which color)” | Met: contract event queries, latest-20 ordering and reorganization overlap; 25 mocked events render 20 with address, coordinates and color. Actual empty feed has no sample entries. |
| “wallet connection” and missing-chain offer | Met: EIP-6963/EIP-1193, connect/disconnect, account/chain listeners, rejection handling and exact `wallet_addEthereumChain` parameters following 4902. |
| “relevant contract state before requesting a transaction” | Met: canvas/current pixel, account balance, cooldown, chain and freshness gate; simulation plus account/chain recheck before signing. |
| “source, lockfile and static export” with relative base | Met: Vite/React/TypeScript and npm lockfile under `web/`; relative production assets tested at `/preview/`. |
| “runtime deployment configuration” matches handoff and enumerates every file | Met: browser fetches `imd-deployment.json` and referenced ABI; canonical ABI verification, exact schema and SHA-256 inventory checks. No separate compiled address map. |
| “network block copied unchanged” | Met: unchanged `network` and `walletAddChain`; exact comparison in `scripts/verify.mjs`. No poolKey exists in this handoff. |
| “first screen at 390” and no sideways scroll at 320/390 | Met: final measured first-screen bounds; probe and browser reflow tests, including long values and enlarged text. |
| “title, favicon, description, og:title and og:image” | Met: all metadata present; real local 1200×630 `share.png` and SVG favicon exported and hashed. |
| Better Interface, six-domain review and design documentation | Met within path budget: review below and `docs/DESIGN.md`. Root `DESIGN.md` is intentionally not created because the higher-priority write-scope rule excludes it. |
| Public source URL, hosted website and fixed CID/naming checks | After worker delivery: publisher/control-plane responsibility, not claimed here. |

The visual idea is a quiet shared sheet of pixels, framed by a compact painting palette and a readable activity feed.

## Commands and evidence

Commands run from `web/` unless noted:

| Command | Outcome / durable evidence |
| --- | --- |
| `npm ci` / dependency installation via npm | Locked dependencies installed under `web/node_modules`; excluded from Git. Source installs originally used `npm install`, followed by locked-install verification. |
| `npm run build` | Passed; `frontend-evidence/build.txt`. Includes TypeScript and generates the deployment manifest after Vite export. |
| `npm run typecheck` | Passed; `frontend-evidence/typecheck.txt`. |
| `npm test` | 8 passed; `frontend-evidence/unit-tests.txt`. |
| `node scripts/verify.mjs` | Passed; `frontend-evidence/manifest-check.json`. Every final exported file except the manifest is inventoried; ABI matches both pinned Git source and handoff. |
| `npm run verify:live` | Passed on all 3 public RPCs; `frontend-evidence/live-rpc.json`. Chain 11155111; 1,083-byte runtime; 4,096 canvas bytes; WIDTH/HEIGHT/COLOR_COUNT/PIXEL_COUNT/COOLDOWN = 64/64/16/4096/30. |
| `npm run test:browser` with installed browser path and temporary WebKit launcher | 9 passed; `frontend-evidence/browser-results.json`. Actual production export, mocked RPC and wallets, no transactions broadcast. |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` from repository root | 16/16 passed; `frontend-evidence/taste-summary.json` and `probe-390-first-screen.png`. The supplied script was not modified. |
| `npm audit --json` | Zero known advisories in final dependencies; `frontend-evidence/dependency-audit.json`. |

Browser tests check the successful paint flow in Chromium and WebKit: disconnected viewing, 16-color palette, keyboard cursor, exact-coordinate selection, wallet connection, encoded `paint(7,9,12)`, no transferred value, simulation before signing, pending lock, confirmed canvas/feed and cooldown expiry. Other Chromium scenarios cover missing wallets and dialog focus return; rejected connect/switch/sign requests; unknown-chain addition; custom-error simulation failure; account changes; RPC outage and retry; missing bytecode; ABI tampering; latest-20 events; full addresses/large balances; 200% text enlargement; pending-hash recovery after reload; and reverted receipts. The harness rejects unexpected RPC methods, local resource failures and browser JavaScript errors.

The WebKit runtime initially lacked shared libraries. It was run with temporary extracted libraries, an explicit Mesa EGL vendor path and a small launcher under `test/scratch/`. No browser binary, extracted library, downloaded package archive or launcher is part of the submission. These are worker test prerequisites, not application dependencies.

Live RPC evidence checks the factory deployment properly: successful receipt at the handoff block; code absent in the preceding block and present at that block; unchanged current runtime; and an event containing the handoff address, source commit and attestation hash. The factory receipt's top-level `contractAddress` is null, so it is not treated as a direct deployment. This does not claim a new independent Solidity audit or a runtime-bytecode recompile.

## Rendered review and Better Interface coverage

The tool browser opened the export at a gateway-like `/preview/` subpath and used live public RPC reads. Screenshots were inspected at 320, 390 and 1440 wide. The actual empty canvas and feed were visible, keyboard pixel selection was exercised, and the console reported zero errors/warnings. Separate Playwright interaction tests checked mocked connected, pending, confirmed, cooldown and long-value states. The 768px intermediate layout and 200% CSS text enlargement were also exercised. Narrow viewports and text enlargement are not claims of native mobile hardware or browser-native zoom testing.

| Domain | Coverage | Evidence / limitation |
| --- | --- | --- |
| Accessibility | Checked | Native controls and disclosure, all names/labels, canvas arrows and Enter, coordinate alternative, visible focus, wallet-dialog Escape/focus return, stable transaction live region, error recovery, reduced-motion policy. No manual screen-reader, switch-control or physical-device session. |
| Layout | Checked | First-screen bounds at 390; overflow at 320/390/768/1440; long full addresses, large balances and text enlargement; desktop grid gap repaired. Native 200% browser zoom and RTL/localization not tested; interface is English-only. |
| Writing | Checked | Actions match their behavior; plain, recoverable wallet/RPC/transaction errors; actual loading/empty/partial-history states; explicit test ETH/gas explanation. No sample data presented as live. |
| Typography | Checked | Four sizes per viewport, weights 400/600/700, heading hierarchy, 16px inputs, wrapping values, tabular numbers. No loaded web-font claim; local/system fallback is intentional. |
| Colors | Checked | Measured solid text/background pairs and control boundary; named semantic roles; selected color also has a check. Light theme only. All possible art colors are not text backgrounds. |
| UI | Checked | Default, focused, selected, disabled, loading, pending, success, failure and empty states; flat surfaces, native modal and single primary action. Only 120ms opt-in hover transitions, no endless motion. No animations needing a slow-motion timeline review. |

Measured final pairs (`frontend-evidence/visual-measurements.json`): primary text on page **13.04:1**; muted text on page **5.43:1**; white primary-button text on rust **5.58:1**; control boundary on page **3.14:1**; blue focus color on white **6.05:1**. Text meets 4.5:1, large text 3:1; control boundaries meet 3:1. The probe separately measured visible text and found no failed pair. Transparent backgrounds/borders were not treated as opaque contrast measurements in the evidence summary.

## Findings, fixes and rechecks

All listed findings are resolved; locations name the final source containing each fix.

| Severity / domain | Source | Observed issue | Fix and recheck |
| --- | --- | --- | --- |
| High · layout | `web/src/CanvasBoard.tsx:52`, `web/src/App.tsx:98`, `web/src/styles.css:147` | Initial 390×844 action bottom was 875.69px; the primary action was cut off by the first screen. | Moved exact-coordinate disclosure below the action; tightened mobile header/group spacing. Final bottom is 811.69px, with the gas note also fully visible; screenshots plus both engine tests pass. |
| High · layout/accessibility | `web/src/styles.css:34`, `web/src/styles.css:57`, `web/src/styles.css:76` | Header/heading rows overflowed with 200% text and long connected content. | Enabled wrapping for header, canvas rows and section headings. Reflow test now passes with full addresses and balance at all tested widths and enlarged text. |
| Medium · UI/wallet | `web/src/wallet.ts:33` | A quick Connect after reload could open a chooser before an already-injected wallet's delayed discovery finished. | Discover existing injection immediately, retain event-based discovery for later providers. Pending-reload and connect tests pass. |
| Medium · layout | `web/src/styles.css:54` | Automatic grid-row distribution left an unnecessarily large gap between desktop controls and activity. | Use a minimum-content first row, leaving remaining height in the canvas-spanning region. Final desktop screenshot inspected. |
| Medium · data correctness | `web/src/chain.ts:39`, `web/src/chain.ts:74` | A feed previously marked complete by 20 entries could retain that status after a reorganization reduced the list. | Track reaching contract birth separately, resume backward search when fewer than 20 remain, replace shallow overlap. Event/history tests pass. Range splitting now occurs for range-limit errors rather than every network failure. |
| Medium · colors/accessibility | `web/src/styles.css:78` | The white palette control's translucent edge was weaker than the 3:1 boundary target. | Use the shared solid control-border token. Final measured border/page contrast is 3.14:1. |
| Low · accessibility | `web/src/App.tsx:99` | The changing countdown shared a polite announcement region with transaction feedback. | Keep the timer outside the stable transaction status region to avoid a once-per-second announcement stream. Source reviewed and browser regression passed; a screen-reader session remains unperformed. |
| Maintenance · dependencies | `web/package.json` | Initial npm audit found advisories in Vite and transitive ws/esbuild. | Pin Vite 7.3.7, ws 8.21.0 and esbuild 0.28.2; rebuild, typecheck and browser suite passed; final audit has zero reported advisories. |

The 16-color palette's 29–38px phone targets are intentionally compact; they meet the probe's 24px/spaced-target rule but not the 44px comfort recommendation. Main actions meet 44px. Tiny spatial canvas pixels have exact-coordinate inputs as the equivalent large-target control.

## Evidence index and limitations

- `live-320.png`, `live-390.png`, `live-1440.png`: real public-read, disconnected page; blank canvas was the actual state observed.
- `live-1440-keyboard.png`: keyboard selection and visible focus on that live canvas; no transaction sent.
- `probe-390-first-screen.png`: final pinned probe screenshot, first screen only.
- `chromium-390-disconnected.png`, `webkit-390-disconnected.png`: isolated browser fixture with mocked empty chain reads.
- `chromium-390-confirmed-mock.png`, `webkit-390-confirmed-mock.png`: mocked confirmation/cooldown, never live paint claims.
- `chromium-1440-activity-mock.png`: synthetic 25-event test reduced to the latest 20, including full-address stress data. These fixtures are confined to tests and are not in runtime code.

No real wallet signature, gas payment or live `paint` transaction was broadcast. Physical iOS/Android wallets, extension-specific signing dialogs, WalletConnect, manual assistive-technology sessions, native zoom, deep reorganizations and adversarial RPC correctness were not tested. The code handles pending/reverted/replaced transactions, but actual wallet cancellation/repricing and the full 90-second confirmation timeout were not exercised live. Public RPC outages/rate limits and historical-code availability can affect read/feed completion; the interface reports failures and keeps painting gated. Social metadata remains relative until the publisher supplies a domain. Publication checks, named URLs and CIDs are not represented as having passed.

Complete for the stated frontend worker scope, subject to these disclosed live-chain/publication and manual-device limitations. The root `DESIGN.md` location is the one intentional path adaptation, required by the assignment's stronger scope rule. Submission size/path evidence is recorded in `frontend-evidence/submission-check.json`.
