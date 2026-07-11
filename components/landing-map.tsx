"use client";

import WorldMap from "@/components/ui/world-map";

const mapDots = [
  {
    start: { lat: 43.65, lng: -79.38, label: "Toronto" },
    end: { lat: 37.77, lng: -122.42, label: "San Francisco" },
  },
  {
    start: { lat: 40.71, lng: -74.01, label: "New York" },
    end: { lat: 42.36, lng: -71.06, label: "Boston" },
  },
  {
    start: { lat: 45.5, lng: -73.57, label: "Montreal" },
    end: { lat: 49.28, lng: -123.12, label: "Vancouver" },
  },
  {
    start: { lat: 30.27, lng: -97.74, label: "Austin" },
    end: { lat: 41.88, lng: -87.63, label: "Chicago" },
  },
];

export function LandingMap() {
  return <WorldMap dots={mapDots} lineColor="#721c24" />;
}
