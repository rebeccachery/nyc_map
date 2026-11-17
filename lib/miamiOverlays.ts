import {
  fetchArcGisGeoJson,
  fetchGeoJsonUrl,
  mergeFeatureCollections,
} from "@/lib/arcgisGeoJson";
import type { Feature, FeatureCollection } from "geojson";

const MIAMI_DADE_SCHOOLS_URL =
  "https://gisweb.miamidade.gov/arcgis/rest/services/MD_Emaps/MapServer/25/query";
const MIAMI_DADE_LIBRARIES_URL =
  "https://gisweb.miamidade.gov/arcgis/rest/services/MD_Emaps/MapServer/3/query";
const BROWARD_SCHOOLS_GEOJSON =
  "https://geohub-bcgis.opendata.arcgis.com/datasets/b888ffdf409044829a8cfe9d69c16a02_0.geojson?outSR=4326";
// Broward County GIS (BCGIS) "Libraries" layer. The GeoHub dataset previously used here
// (f9944ea846044fdba11e4c057d2344a7) actually holds Richmond, Virginia library branches.
const BROWARD_LIBRARIES_URL =
  "https://bcgishub.broward.org/server/rest/services/Core/Libraries/MapServer/0/query";
const PALM_BEACH_SCHOOLS_URL =
  "https://maps.co.palm-beach.fl.us/arcgis/rest/services/OpenData/Education_Open_Data/MapServer/0/query";
const PALM_BEACH_LIBRARIES_URL =
  "https://maps.co.palm-beach.fl.us/arcgis/rest/services/OpenData/Education_Open_Data/MapServer/5/query";

function normalizeMiamiDadeSchool(feature: Feature): Feature {
  const props = feature.properties ?? {};
  return {
    ...feature,
    properties: {
      school_name: props.NAME ?? "Unknown School",
      primary_address_line_1: props.ADDRESS ?? "",
      city: props.CITY ?? "",
      zip: props.ZIPCODE ? String(props.ZIPCODE).padStart(5, "0") : "",
      grades: props.GRADES ?? "",
      enrollment: props.ENROLLMNT ?? null,
      county: "Miami-Dade",
      source: "Miami-Dade GIS",
    },
  };
}

function normalizeBrowardSchool(feature: Feature): Feature {
  const props = feature.properties ?? {};
  return {
    ...feature,
    properties: {
      school_name: props.NAME ?? "Unknown School",
      primary_address_line_1: props.ADDRESS ?? "",
      city: props.CITY ?? "",
      zip: props.ZIP ? String(props.ZIP).padStart(5, "0") : "",
      phone: props.PHONE ?? "",
      county: "Broward",
      source: "Broward GeoHub",
    },
  };
}

function normalizeMiamiDadeLibrary(feature: Feature): Feature {
  const props = feature.properties ?? {};
  return {
    ...feature,
    properties: {
      name: props.BRANCH ?? props.name ?? "Library Branch",
      streetAddress: props.ADDRESS ?? "",
      city: props.CITY ?? "",
      zip: props.ZIPCODE ? String(props.ZIPCODE).padStart(5, "0") : "",
      url: props.WEBSITE ?? "",
      county: "Miami-Dade",
      system: "Miami-Dade Public Library",
    },
  };
}

function normalizeBrowardLibrary(feature: Feature): Feature {
  const props = feature.properties ?? {};
  return {
    ...feature,
    properties: {
      name: props.LIBNAME ?? "Library Branch",
      streetAddress: props.ADDRESS ?? "",
      city: props.CITY ?? "",
      zip: props.ZIPCODE ? String(props.ZIPCODE).padStart(5, "0") : "",
      phone: props.PHONE2 ?? "",
      branchType: props.TYPE ?? "",
      county: "Broward",
      system: "Broward County Library",
    },
  };
}

function parseZipFromAddress(address: string): string {
  const match = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  return match ? match[1] : "";
}

function normalizePalmBeachSchool(feature: Feature): Feature {
  const props = feature.properties ?? {};
  const address = String(props.ADDRESS ?? props.ADDRESS1 ?? "");
  const gradeFields = ["GRADE_01", "GRADE_02", "GRADE_03", "GRADE_04", "GRADE_05", "GRADE_06", "GRADE_07", "GRADE_08", "GRADE_09"];
  const grades = gradeFields
    .map((field) => props[field])
    .filter(Boolean)
    .join(", ");

  return {
    ...feature,
    properties: {
      school_name: props.NAME ?? "Unknown School",
      primary_address_line_1: address,
      city: props.MUNICIPALI ?? "",
      zip: props.ZIPCODE ? String(props.ZIPCODE).padStart(5, "0") : parseZipFromAddress(address),
      phone: props.PHONE ?? "",
      grades: grades || props.TYPE || "",
      school_type: props.TYPE ?? "",
      county: "Palm Beach",
      source: "Palm Beach County GIS",
    },
  };
}

function normalizePalmBeachLibrary(feature: Feature): Feature {
  const props = feature.properties ?? {};
  return {
    ...feature,
    properties: {
      name: props.NAME ?? "Library Branch",
      streetAddress: props.ADDRESS ?? "",
      city: props.MUNICIPALITY ?? "Palm Beach County",
      zip: props.ZIP ? String(props.ZIP).padStart(5, "0") : "",
      url: props.WEBSITE ?? "",
      phone: props.PHONE ?? "",
      county: "Palm Beach",
      system: "Palm Beach County Library",
    },
  };
}

export async function fetchMiamiSchools(): Promise<FeatureCollection> {
  const [miamiDade, broward, palmBeach] = await Promise.all([
    fetchArcGisGeoJson(MIAMI_DADE_SCHOOLS_URL, {
      outFields: "NAME,ADDRESS,CITY,ZIPCODE,GRADES,ENROLLMNT",
    }),
    fetchGeoJsonUrl(BROWARD_SCHOOLS_GEOJSON),
    fetchArcGisGeoJson(PALM_BEACH_SCHOOLS_URL, {
      outFields: "NAME,ADDRESS,ADDRESS1,MUNICIPALI,PHONE,TYPE,GRADE_01,GRADE_02,GRADE_03,GRADE_04,GRADE_05,GRADE_06,GRADE_07,GRADE_08,GRADE_09",
    }),
  ]);

  return mergeFeatureCollections([
    {
      type: "FeatureCollection",
      features: miamiDade.features.map(normalizeMiamiDadeSchool),
    },
    {
      type: "FeatureCollection",
      features: broward.features.map(normalizeBrowardSchool),
    },
    {
      type: "FeatureCollection",
      features: palmBeach.features.map(normalizePalmBeachSchool),
    },
  ]);
}

export async function fetchMiamiLibraries(): Promise<FeatureCollection> {
  const [miamiDade, broward, palmBeach] = await Promise.all([
    fetchArcGisGeoJson(MIAMI_DADE_LIBRARIES_URL, {
      outFields: "BRANCH,ADDRESS,CITY,ZIPCODE,WEBSITE",
    }),
    fetchArcGisGeoJson(BROWARD_LIBRARIES_URL, {
      outFields: "LIBNAME,ADDRESS,CITY,ZIPCODE,PHONE2,TYPE",
    }),
    fetchArcGisGeoJson(PALM_BEACH_LIBRARIES_URL, {
      outFields: "NAME,ADDRESS,MUNICIPALITY,ZIP,PHONE,WEBSITE",
    }),
  ]);

  return mergeFeatureCollections([
    {
      type: "FeatureCollection",
      features: miamiDade.features.map(normalizeMiamiDadeLibrary),
    },
    {
      type: "FeatureCollection",
      features: broward.features.map(normalizeBrowardLibrary),
    },
    {
      type: "FeatureCollection",
      features: palmBeach.features.map(normalizePalmBeachLibrary),
    },
  ]);
}
