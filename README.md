# NYC Map: Haitian Demographics & Educational Need in NYC
![Status](https://img.shields.io/badge/status-active-brightgreen)
![Stage](https://img.shields.io/badge/stage-research%20prototype-orange)
![Community](https://img.shields.io/badge/community-Haitian%20NYC-red)
![Analysis](https://img.shields.io/badge/analysis-educational%20need-blue)
![Feature](https://img.shields.io/badge/feature-layered%20map-teal)
![Feature](https://img.shields.io/badge/feature-borough%20analysis-0f766e)
![Support](https://img.shields.io/badge/focus-ESL%20%26%20literacy-green)
![Data](https://img.shields.io/badge/data-public%20datasets-yellow)

An interactive NYC map for exploring Haitian population density, educational need, and nearby resources. Built with Next.js and Plotly.

The app overlays ZIP-level demographic choropleths with public high schools and library locations to help identify corridors where high Haitian population overlaps with limited internet access, low educational attainment, and gaps in tutoring support.

## Overview

This project reorients the NYC Map application toward educational equity analysis for Haitian communities across the five boroughs. Instead of focusing on general mapping or commute visualization, the app is designed to help users identify neighborhoods where Haitian ancestry population, limited English proficiency, internet access gaps, and lower adult educational attainment intersect with uneven access to schools and tutoring-support spaces.

The application dynamically pulls and merges public datasets to create a layered map experience that supports both visual exploration and borough-level analysis.

## Features

- **Haitian Pop Heat (ZIP)** — Choropleth by Modified ZCTA (MODZCTA) using Census ACS 2022 data
- **Need scoring modes**
  - **Population %** — Haitian ancestry as a share of total population
  - **Educational Need** — Composite score (40% Haitian pop · 30% no internet · 30% no HS diploma)
- **High / Medium / Low Need** tiers with a color legend and per-ZIP detail panel
- **Public high schools** — Color-coded by graduation rate, with ESL and safety metrics
- **Libraries** — Tutoring and literacy hub locations
- **Layer toggles**, opacity control, borough filter, and ZIP search
- **Click-to-select** — Click a ZIP on the map to inspect neighborhood stats; map flies to the selection

## Data Sources

| Source | Used for |
|--------|----------|
| [U.S. Census ACS 2022 (5-year)](https://api.census.gov/data/2022/acs/acs5) | Haitian ancestry, population, language, internet, education by ZCTA |
| [NYC MODZCTA boundaries](https://data.cityofnewyork.us/Health/Modified-Zip-Code-Tabulation-Areas-MODZCTA-/pri4-ifjk) | ZIP polygon geometry |
| [NYC Open Data — High Schools](https://data.cityofnewyork.us/Education/2018-2019-School-Level-Detailed-Report-Card/vw9i-7mzq) | School locations and performance |
| [NYC Open Data — Libraries](https://data.cityofnewyork.us/City-Government/Public-Library-Locations/feuq-due4) | Library locations |

> **Note:** ZCTA (Zip Code Tabulation Area) boundaries approximate USPS ZIP codes. ACS estimates have margins of error; ZIPs with small populations may show as "Insufficient Data."

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

Visit `http://localhost:3000` in your browser.

The first load of the ZCTA layer may take 20–30 seconds while Census data is fetched; results are cached server-side for one hour.

## Future Improvements

- Add tract- or neighborhood-level demographic resolution
- Incorporate more direct tutoring and after-school program datasets
- Add filtering by grade band, borough, or educational risk threshold
- Support exportable reports or snapshots for advocacy use
- Expand language-support analysis beyond Haitian Creole communities


### Optional environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CENSUS_API_KEY` | Recommended | Census Bureau Data API key |
| `NEXT_PUBLIC_NYC_SODA_APP_TOKEN` | No | NYC Open Data app token for higher rate limits |

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
  page.tsx              # App entry
  api/
    demographics/       # Borough-level Census ACS data
    haitian-zcta/       # ZIP choropleth (Census + MODZCTA join)
    schools/            # High school GeoJSON
    libraries/          # Library GeoJSON
components/
  CommuteApp.tsx        # Data fetching and state orchestration
  NYCMapCore.tsx        # Plotly map rendering
  Sidebar.tsx           # Layer controls, legend, ZIP panel
  HeatLegend.tsx        # Choropleth color scale legend
  ZctaInfoPanel.tsx     # Selected ZIP detail panel
lib/
  haitianNeed.ts        # Need tier classification and composite scoring
  census.ts             # Census API helpers
  geo.ts                # GeoJSON utilities
```

## API Routes

All routes return `{ success: true, data: ... }` or `{ success: false, error: "..." }`.

| Route | Description |
|-------|-------------|
| `GET /api/haitian-zcta` | MODZCTA GeoJSON joined with Census ZCTA stats and need tiers |
| `GET /api/demographics` | Borough-level Haitian population and education metrics |
| `GET /api/schools` | High school point GeoJSON |
| `GET /api/libraries` | Library point GeoJSON |


## Example Findings

Manual verification of the current data highlighted several strong educational-need corridors:

- **Brooklyn** shows the largest Haitian ancestry population and a substantial concentration of limited English speakers, indicating strong demand for ESL-linked support.
- **Queens** also shows a large Haitian population with notable internet-access and literacy-related barriers.
- **The Bronx** presents especially high educational vulnerability relative to population size, with stronger internet-access and adult low-literacy risk indicators.

These patterns become especially useful when compared against school quality signals and areas with sparse library coverage, helping expose possible tutoring or literacy-support deserts.

## Why This Project Matters

This project is designed as a data-driven equity mapping tool. It can support:

- Community advocacy
- Education-focused nonprofit analysis
- Public-interest research
- Resource allocation discussions
- Exploration of immigrant support infrastructure in NYC

By combining demographic and educational support data in one interface, the map helps make service gaps easier to identify and communicate.

## License

Private project.
