# Haitian Educational Equity Map

![Status](https://img.shields.io/badge/status-active-brightgreen)
![Stage](https://img.shields.io/badge/stage-research%20prototype-orange)
![Community](https://img.shields.io/badge/community-Haitian%20communities-red)
![Analysis](https://img.shields.io/badge/analysis-educational%20need-blue)
![Feature](https://img.shields.io/badge/feature-multi--metro-teal)
![Feature](https://img.shields.io/badge/feature-layered%20map-0f766e)
![Support](https://img.shields.io/badge/focus-ESL%20%26%20literacy-green)
![Data](https://img.shields.io/badge/data-public%20datasets-yellow)

An interactive map for exploring Haitian population density, educational need, and nearby resources across U.S. metros. Built with Next.js and Plotly.

The app overlays ZIP-level demographic choropleths with public schools and library locations to help identify corridors where high Haitian population overlaps with limited internet access, low educational attainment, and gaps in tutoring support.

## Overview

This project is a config-driven equity mapping tool for Haitian communities. It uses the same Census variables and need-scoring methodology across metros, while swapping boundary sources, region filters, and overlay datasets per city.

Currently supported metros:

| Metro | Route | Regions | ZIP areas |
|-------|-------|---------|-----------|
| **New York City** | `/map/nyc` | 5 boroughs | ~200 MODZCTAs |
| **Miami Metro** | `/map/miami` | Miami-Dade, Broward, Palm Beach | ~197 ZCTAs |

Visit `/` to pick a metro, or use the header switcher to move between maps. Layer preferences (need mode, toggles, opacity) carry over; ZIP and region selection reset on switch.

## Features

- **Multi-metro support** — NYC and Miami Metro with shareable routes (`/map/nyc`, `/map/miami`)
- **Haitian Pop Heat (ZIP)** — Choropleth using Census ACS 2022 data
- **Need scoring modes**
  - **Population %** — Haitian ancestry as a share of total population
  - **Educational Need** — Composite score (40% Haitian pop · 30% no internet · 30% no HS diploma)
- **High / Medium / Low Need** tiers with a color legend and per-ZIP detail panel
- **Public schools** — NYC schools color-coded by graduation rate; Miami metro shows school locations across three counties
- **Libraries** — Tutoring and literacy hub locations
- **Layer toggles**, opacity control, region filter (borough/county), and ZIP search
- **Click-to-select** — Click a ZIP on the map to inspect neighborhood stats; map flies to the selection

## Data Sources

### Shared

| Source | Used for |
|--------|----------|
| [U.S. Census ACS 2022 (5-year)](https://api.census.gov/data/2022/acs/acs5) | Haitian ancestry, population, language, internet, education by ZCTA and county |

### New York City

| Source | Used for |
|--------|----------|
| [NYC MODZCTA boundaries](https://data.cityofnewyork.us/Health/Modified-Zip-Code-Tabulation-Areas-MODZCTA-/pri4-ifjk) | ZIP polygon geometry |
| [NYC Open Data — High Schools](https://data.cityofnewyork.us/Education/2018-2019-School-Level-Detailed-Report-Card/vw9i-7mzq) | School locations and performance metrics |
| [NYC Open Data — Libraries](https://data.cityofnewyork.us/City-Government/Public-Library-Locations/feuq-due4) | Library locations |

### Miami Metro

| Source | Used for |
|--------|----------|
| [Census TIGER ZCTA boundaries](https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/11) | ZIP polygon geometry (filtered to MSA via `data/miami-msa-zctas.json`) |
| [Miami-Dade GIS — MD_Emaps](https://gisweb.miamidade.gov/arcgis/rest/services/MD_Emaps/MapServer) | Public schools and libraries |
| [Broward GeoHub](https://geohub-bcgis.opendata.arcgis.com) | Public schools and libraries |
| [Palm Beach County GIS — Education Open Data](https://maps.co.palm-beach.fl.us/arcgis/rest/services/OpenData/Education_Open_Data/MapServer) | Public schools and libraries |

> **Note:** ZIP boundaries approximate USPS mail routes. NYC uses Modified ZCTA (MODZCTA); Miami uses standard Census ZCTA. ACS estimates have margins of error; ZIPs with small populations may show as "Insufficient Data."

## Getting Started

### Prerequisites

- Node.js 20+
- A free [Census API key](https://api.census.gov/data/key_signup.html)

### Install and run

```bash
npm install
cp .env.example .env.local
```

Add your Census API key to `.env.local`:

```env
CENSUS_API_KEY=your_key_here
```

```bash
npm run dev
```

### Open the app

| URL | Description |
|-----|-------------|
| `http://localhost:3000` | Metro picker landing page |
| `http://localhost:3000/map/nyc` | New York City map |
| `http://localhost:3000/map/miami` | Miami Metro map |

The first load of the ZCTA layer may take 20–30 seconds while Census data is fetched; results are cached server-side for one hour.

### Optional environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CENSUS_API_KEY` | Recommended | Census Bureau Data API key |
| `NEXT_PUBLIC_NYC_SODA_APP_TOKEN` | No | NYC Open Data app token for higher rate limits (NYC only) |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (webpack) |
| `npm run dev:turbo` | Start development server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

## Project Structure

```
app/
  page.tsx                    # Metro picker landing page
  map/[metroId]/page.tsx      # Dynamic metro map routes
  api/
    demographics/             # County/borough-level Census ACS data
    haitian-zcta/             # ZIP choropleth (Census + boundaries join)
    schools/                  # School point GeoJSON
    libraries/                # Library point GeoJSON
components/
  CommuteApp.tsx              # Data fetching and state orchestration
  AppShell.tsx                # Header with metro switcher
  MetroSwitcher.tsx           # NYC / Miami toggle
  MetroLanding.tsx            # Landing page metro cards
  NYCMapCore.tsx              # Plotly map rendering
  Sidebar.tsx                 # Layer controls, legend, ZIP panel
  HeatLegend.tsx              # Choropleth color scale legend
  ZctaInfoPanel.tsx           # Selected ZIP detail panel
data/
  miami-msa-zctas.json        # Miami MSA ZIP list with county assignment
lib/
  metroRegistry.ts            # Metro configs (regions, labels, overlays)
  metroApi.ts                   # Metro query param helpers
  boundaries.ts                 # MODZCTA and TIGER boundary fetchers
  enrichHaitianZcta.ts          # Shared need-tier enrichment
  demographics.ts               # County demographics parser
  miamiOverlays.ts              # Miami-Dade, Broward, Palm Beach overlays
  haitianNeed.ts                # Need tier classification and composite scoring
  census.ts                     # Census API helpers
  geo.ts                        # GeoJSON utilities
```

## API Routes

All routes accept an optional `?metro=nyc|miami` query parameter (defaults to `nyc`). Responses follow `{ success: true, data: ... }` or `{ success: false, error: "..." }`.

| Route | NYC | Miami |
|-------|-----|-------|
| `GET /api/haitian-zcta` | MODZCTA GeoJSON + Census join, need tiers | TIGER ZCTA GeoJSON + Census join (~197 ZIPs), need tiers |
| `GET /api/demographics` | 5 borough county-level metrics | 3 county-level metrics (Miami-Dade, Broward, Palm Beach) |
| `GET /api/schools` | NYC Open Data with graduation rates | Miami-Dade, Broward, and Palm Beach GIS locations |
| `GET /api/libraries` | NYC Open Data locations | Miami-Dade, Broward, and Palm Beach GIS locations |

## Example Findings

### New York City

Manual verification of the current data highlighted several strong educational-need corridors:

- **Brooklyn** shows the largest Haitian ancestry population and a substantial concentration of limited English speakers, indicating strong demand for ESL-linked support.
- **Queens** also shows a large Haitian population with notable internet-access and literacy-related barriers.
- **The Bronx** presents especially high educational vulnerability relative to population size, with stronger internet-access and adult low-literacy risk indicators.

### Miami Metro

- **Miami-Dade** (including Little Haiti, 33127) shows the highest Haitian ancestry concentration in the metro.
- **Broward** has a large Haitian population with its own school and library infrastructure to compare against need tiers.
- **Palm Beach** completes the MSA view, though Haitian population share is lower than in Miami-Dade and Broward.

These patterns become especially useful when compared against school and library coverage, helping expose possible tutoring or literacy-support deserts.

## Future Improvements

- Add deep links (`?zip=`, `?mode=`, `?region=`) for shareable map states
- Incorporate school performance data for Miami metro counties
- Add tract- or neighborhood-level demographic resolution
- Incorporate more direct tutoring and after-school program datasets
- Support exportable reports or snapshots for advocacy use
- Add additional metros via `lib/metroRegistry.ts`

## Why This Project Matters

This project is designed as a data-driven equity mapping tool for Haitian communities in major U.S. metros. It can support:

- Community advocacy
- Education-focused nonprofit analysis
- Public-interest research
- Resource allocation discussions
- Cross-metro comparison of immigrant support infrastructure

By combining demographic and educational support data in one interface, the map helps make service gaps easier to identify and communicate.

## License

Private project.
