# i20 Telemetry

"Strava for your car" for a 2024 Hyundai i20 1.2 IVT. A web app that runs on an
Android phone (Galaxy S20 FE) in Chrome, talks to a **Vgate iCar Pro 2S** (BLE)
OBD-II adapter over Web Bluetooth, and logs every drive locally.

## What it does
- **Live dashboard:** speed, RPM, throttle, load, coolant, volts, live and trip km/l
- **Drive logging:** GPS route + engine data at 4 Hz, autosaved every minute, stored in IndexedDB on the phone
- **0–60 / 0–100 timer:** detects standing-start launches automatically
- **Ghost races:** race a previous drive of the same route, with a live +/− seconds display
- **Recap:** route map colored by speed, stats, smoothness score, speed and RPM charts, and an Insta-story recap card
- **Fuel and cost:** speed-density fuel estimate (the Kappa 1.2 has no MAF sensor), ₹ per drive

## Develop
```
npm install
npm run dev        # http://localhost:5173 (use "Simulated route" + "Simulated i20")
npm test           # unit tests, including the full ELM327 stack against the simulator
npm run build
```

## Deploy (Cloudflare Pages)
Web Bluetooth and GPS need HTTPS, so the phone loads the app from Cloudflare Pages.
```
npx wrangler login                                                        # once
npx wrangler pages project create i20-telemetry --production-branch main  # once
npm run deploy
```
Only the app code is hosted. Drive data never leaves the phone.

## Layout
- `src/lib/obd/`: ELM327 protocol, PID decoding, BLE transport, simulated i20
- `src/lib/session.ts`: wires GPS + OBD + recording together
- `src/lib/analysis.ts`, `launch.ts`, `ghost.ts`, `fuel.ts`: the maths
- `src/components/`: screens
