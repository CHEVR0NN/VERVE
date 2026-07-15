# Verve Portal

A private members club management platform, built as a portfolio piece. Three portals (member, staff, management) covering bookings, check-ins, guest passes, events, and analytics.

The live build runs fully client side. `public/js/demo-mode.js` intercepts all backend API calls and answers them from an in-memory mock dataset, so no server or database is needed to explore it.

## Demo credentials

### Member portal (`index.html`)

Log in with a Membership ID and matching email.

| Membership ID | Email | Name |
|---|---|---|
| VRV-0001 | ava.sinclair@vrv.com | Ava Sinclair |
| VRV-0002 | cole.bennett@vrv.com | Cole Bennett |
| VRV-0003 | grace.holloway@vrv.com | Grace Holloway |
| VRV-0004 | everett.shaw@vrv.com | Everett Shaw |

### Staff portal (`staff-login.html`)

| Username | Password | Role |
|---|---|---|
| staff | staff123 | Front Desk |
| security | staff123 | Security |
| fnb | staff123 | F&B Manager |

### Management portal (`management-login.html`)

| Username | Password | Role |
|---|---|---|
| admin | admin123 | Admin |

## Features

- **Member**: facility booking, guest registration, event browsing, notifications and inbox replies
- **Staff**: daily schedule, QR check-in, walk-in logging, F&B service view, member lookup, late-cancellation fee waivers
- **Management**: KPI dashboard, occupancy tracking, analytics, no-show and guest audit, facility blocks, event management, inbox

## Running locally

```
npm install
npm start
```

This serves the `public/` folder with `serve` (see `package.json`).

## Tech stack

Static HTML, CSS, and vanilla JS. No framework, no build step. `demo-mode.js` must load before any other script on a page, it patches `window.fetch` so calls to the real backend resolve locally instead.

## Deployment

Deployed as a static site on Vercel, output directory set to `public` (see `vercel.json`). A separate `railway.toml` exists for the real backend, which is not connected in this build.

## Note

This is a portfolio demo, not a production system. All data is mock, held in memory, and resets on page reload.
