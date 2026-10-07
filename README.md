# dhroxy-frontend-example

Example React frontend for [dhroxy](https://github.com/c3po-initiative/dhroxy) — a FHIR R4 proxy for sundhed.dk.

<img width="1372" height="919" alt="REACT dhroxy" src="https://github.com/user-attachments/assets/af21265c-4b26-4d9a-bb39-002988f5854e" />


## What it does

A Danish health data dashboard ("Min Sundhedsagent") that fetches real patient data from sundhed.dk via dhroxy and presents it in a unified interface.

### Tabs

- **Overblik** — Dashboard with patient summary, lab results, appointments, conditions, medications, epikriser, and notater. Click "Hent data fra Sundhed.dk" to load everything.
- **Apple HealthKit** — HealthKit data viewer (for local device data)
- **Labsvar Demo** — AI-powered lab result demos: trend analysis, result explainer, prioritization, personal recommendations, health dashboards, and a lab chat interface
- **Data Viewer** — Raw FHIR JSON viewer for all resource types, with individual fetch buttons per endpoint
- **KRAM-faktorer** — Self-reported lifestyle data: Kost (diet), Rygning (smoking), Alkohol, Motion (exercise)
- **Socioøkonomi** — Socioeconomic factors: education, employment, housing, finances, social network
- **Familiehistorik** — Family disease history with add/remove
- **Sundhedsagent** — AI chat that uses all loaded patient data + KRAM + socioeconomic context to give personalized health advice (requires Anthropic API key)

### FHIR resources fetched

| Resource | sundhed.dk endpoint | What it shows |
|---|---|---|
| Patient | personvaelgerportal | Name, CPR, address, relations |
| Observation | proevesvarportal/svaroversigt | Lab results (10 year lookback) |
| Condition | ejournal/forloebsoversigt | Diagnoses from e-journal |
| MedicationStatement | medicinkort2borger | Current medications |
| Immunization | vaccination | Vaccination history |
| Appointment | aftalerborger | Past and upcoming appointments |
| DocumentReference | ejournal epikriser + notater | Epikriser and notater on the dashboard |

### UI features

- Epikriser and notater open in modals with base64-decoded content
- Lab results show value, unit, date, status, and reference ranges
- Appointments are color-coded (upcoming vs past) with status badges
- All self-reported data (KRAM, socio, family, chat) persists in localStorage
- Partial failure handling: if some endpoints fail, the rest still render

## Testing without a sundhed.dk login

dhroxy ships a stub of the sundhed.dk APIs with synthetic data. In the dhroxy repo:

```bash
./gradlew sundhedStub                                              # terminal 1
SUNDHED_CLIENT_BASE_URL=http://127.0.0.1:9090 ./gradlew bootRun    # terminal 2
```

Then `npm start` here and click "Hent data fra Sundhed.dk" (no auth headers needed). The stub's data is dated around June 2026.

## Compatibility notes

Works with dhroxy as of October 2026 and with older versions:

- CPR is read from both `urn:oid:1.2.208.176.1.2` (DK Core, current dhroxy) and the older `urn:dk:cpr`.
- Lab values without a unit arrive as `valueString`; numeric text is treated as a number (`src/utils/fhir.js`).
- `Patient/{id}/$summary` only works for the person logged in on sundhed.dk, so the person selector defaults to "Mig selv".

## Prerequisites

- [dhroxy](https://github.com/c3po-initiative/dhroxy) running on port 8080
- Node.js 18+

```bash
# Start dhroxy from the published container
docker run -p 8080:8080 ghcr.io/c3po-initiative/dhroxy:latest
```

## Quick start

```bash
npm install
npm start
```

Opens on http://localhost:3000. The dev proxy forwards `/fhir/*` requests to `localhost:8080`.

## Authentication

sundhed.dk requires session headers. The frontend cannot set `Cookie` directly via `fetch()`, so it uses `X-Sundhed-*` prefixed headers. The dev proxy (`setupProxy.js`) maps these to the raw names dhroxy expects:

| Frontend sends | Proxy maps to | dhroxy forwards to sundhed.dk |
|---|---|---|
| `X-Sundhed-Cookie` | `cookie` | `cookie` |
| `X-Sundhed-XSRF-Token` | `x-xsrf-token` | `x-xsrf-token` |
| `X-Sundhed-Conversation-UUID` | `conversation-uuid` | `conversation-uuid` |

To get these values: log in to sundhed.dk, open DevTools > Network, and copy from any request. Paste them in the "Authentication Headers" panel on the dashboard.

## How it works

The app fetches FHIR resources from dhroxy as individual parallel GET requests:

```
GET /fhir/Patient
GET /fhir/Observation?date=ge2015-01-01&_count=1000
GET /fhir/Condition
GET /fhir/MedicationStatement
GET /fhir/Immunization
GET /fhir/Appointment
GET /fhir/DocumentReference
```

Each request includes `Accept: application/json` (required — without it sundhed.dk returns HTML for some endpoints like labsvar and medication).

Results are assembled client-side into a bundle structure for the UI.

## Key files

| File | Purpose |
|---|---|
| `src/App.js` | Main app with dashboard, all tabs, and `fetchPatientData()` |
| `src/setupProxy.js` | Dev proxy: `X-Sundhed-*` header mapping (http-proxy-middleware v3) |
| `src/components/HeaderConfig.js` | UI for entering sundhed.dk session headers |
| `src/components/DataViewer.js` | Raw FHIR JSON viewer with per-resource fetch |
| `src/components/HealthKitViewer.js` | Apple HealthKit data viewer |
| `src/components/demos/` | AI-powered lab result demo components |
| `src/services/sundhedDkService.js` | FHIR service client with per-resource methods |

## Notes

- **Port 8080** is the standard dhroxy port — all references use this.
- **Observation lookback**: dhroxy defaults to 6 months. The frontend requests `date=ge2015-01-01` for a wider window.
- **setupProxy.js** uses `http-proxy-middleware` v3 API (`on: { proxyReq }`, not the v2 `onProxyReq`). This file only applies during development.
- **No backend code**: this repo is frontend only. The Kotlin/Spring Boot backend lives in [c3po-initiative/dhroxy](https://github.com/c3po-initiative/dhroxy).

## Production

For production, the frontend is built as static files and served by dhroxy's Spring Boot backend:

```bash
npm run build
# Output in build/ — copy to src/main/resources/static/ in the dhroxy project
```

See the [dhroxy Dockerfile](https://github.com/c3po-initiative/dhroxy/blob/main/Dockerfile) for the multi-stage build that does this automatically.
