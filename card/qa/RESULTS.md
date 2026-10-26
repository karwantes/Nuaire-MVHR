# QA results: card 0.3.0-alpha

Run on 2026-10-26 with `npm run test:all` (Chromium, Firefox and WebKit through Playwright).

| Suite | Result |
|---|---|
| Unit tests (node --test) | 42 passed |
| Geometry / port continuity | 1110 passed |
| Responsive screen matrix | 1116 passed |
| Accessibility | 1140 passed |
| Feature combinations | 1731 passed |
| Screenshots | 21 passed |
| Service payloads and readback | 70 passed |
| State and units | 10 passed |
| GUI parity and persistence | 10 passed |
| Navigation and assets | 5 passed |
| Build | 1 passed |

Screenshots are in [screenshots/](screenshots/), and the raw counts are in [browser-results.json](browser-results.json).

The card was also checked by hand on a live Home Assistant: in a panel view, a section view and the card picker preview, and through the editor's Edit card button in a panel view.