# NYC Map: Haitian Demographics & Educational Need in NYC

An interactive geospatial web application that highlights where high Haitian population density in New York City overlaps with limited educational resources and support. The project combines U.S. Census Bureau demographic indicators with NYC Open Data on schools and public libraries to reveal high-need corridors for ESL support, literacy access, and after-school learning resources.

## Overview

This project reorients the NYC Map application toward educational equity analysis for Haitian communities across the five boroughs. Instead of focusing on general mapping or commute visualization, the app is designed to help users identify neighborhoods where Haitian ancestry population, limited English proficiency, internet access gaps, and lower adult educational attainment intersect with uneven access to schools and tutoring-support spaces.

The application dynamically pulls and merges public datasets to create a layered map experience that supports both visual exploration and borough-level analysis.

## Features

- **Haitian Population Density Layer**  
  Visualizes Haitian ancestry population by county using proportional map bubbles with detailed demographic popups.

- **School Performance Layer**  
  Displays active school locations across NYC with color-coded markers representing graduation-rate risk levels, along with attendance, safety, and ESL program details.

- **Library Access Layer**  
  Maps public library locations as proxies for accessible tutoring, literacy, and after-school support hubs.

- **Educational Need Indicators**  
  Computes key borough-level percentages such as:
  - Limited English speaker share
  - Internet deficit rate
  - Adult low-literacy proxy rate
  - Relative educational support need

- **Interactive Borough Analysis**  
  Lets users zoom into boroughs, toggle overlays, and inspect local demographic and educational conditions through a redesigned analytics dashboard.

## Data Sources

The application integrates data from the following public sources:

- **U.S. Census Bureau ACS 5-Year 2022**
  - Haitian ancestry population
  - Haitian/Creole language speakers
  - Limited English speaking population
  - Household internet access deficit
  - Adult educational attainment proxy indicators

- **NYC Open Data**
  - Active school points and school-level metrics
  - Public library locations across NYC

## Technical Architecture

### Backend API Routes

The application uses an App Router structure with custom API routes to fetch and normalize source data.

#### `demographics/route.ts`
Queries the U.S. Census Bureau ACS 5-Year 2022 dataset across all five NYC counties and aggregates:

- Haitian ancestry population
- Total Haitian/Creole speakers
- Limited English speakers
- Internet deficit rate
- Adult literacy proxy metrics based on adults age 25+ without a high school diploma

#### `schools/route.ts`
Fetches active school points from NYC Open Data and returns a GeoJSON Feature Collection containing:

- DBN
- School name
- Coordinates
- Graduation rates
- Attendance rates
- Safety scores
- ESL program availability

#### `libraries/route.ts`
Fetches and parses public library location data from NYC Open Data to model accessible literacy and tutoring hubs.

### Frontend

The frontend map experience is centered around a redesigned map core and a more analytical sidebar interface.

#### `NYCMapCore.tsx`
Implements three major overlay layers:

- Haitian population density bubbles
- School risk markers
- Library access points

It also supports smooth zooming and panning behavior based on borough selection.

#### `Sidebar.tsx`
Provides a dark glassmorphic dashboard for:

- Toggling map layers
- Selecting boroughs
- Viewing dynamic demographic indicators
- Comparing educational access signals

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

## Tech Stack

- **Frontend:** React / TypeScript
- **Mapping:** Interactive NYC map visualization
- **Backend:** App Router API routes
- **Data Sources:** U.S. Census Bureau ACS 5-Year 2022, NYC Open Data
- **Data Format:** GeoJSON and normalized JSON responses

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/rebeccachery/nyc_map.git
cd nyc_map
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env.local` file and add the required API key:

```env
API_KEY=your_census_api_key_here
```

### 4. Run the development server

```bash
npm run dev
```

### 5. Open the app

Visit `http://localhost:3000` in your browser.

## Future Improvements

- Add tract- or neighborhood-level demographic resolution
- Incorporate more direct tutoring and after-school program datasets
- Add filtering by grade band, borough, or educational risk threshold
- Support exportable reports or snapshots for advocacy use
- Expand language-support analysis beyond Haitian Creole communities
