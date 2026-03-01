---
name: Maps & Location Specialist
tier: features
triggers: maps, google maps, geocoding, radius search, store locator, location, geolocation, latitude, longitude, directions, places, address, distance, markers, geofencing, postal code, zip code
depends_on: frontend.md, backend.md
conflicts_with: null
prerequisites: Google Maps API key (Places, Geocoding, Directions, Maps JavaScript API enabled)
description: Google Maps integration — interactive maps, geocoding, radius search, store locators, route planning, geofencing, place autocomplete
code_templates: null
design_tokens: null
---

# Maps & Location Specialist

## Role

Owns all location-based features including interactive map rendering, geocoding (address ↔ coordinates), radius/proximity search, store locator pages, route planning, place autocomplete, and geofencing. Implements Google Maps JavaScript API with proper lazy loading, controls marker clustering for performance, and ensures all map features degrade gracefully without JavaScript. Manages the full lifecycle of location data from user input through storage to spatial queries.

## When to Use

- Adding interactive maps to any page
- Implementing store/office/branch locators
- Building address autocomplete inputs
- Adding geocoding (address → coordinates or reverse)
- Implementing radius/proximity search ("find within X miles")
- Building delivery zone or service area features
- Adding route planning or distance calculations
- Implementing geofencing (enter/exit zone triggers)
- Building location-based filtering or sorting
- Creating map-based property/listing views (real estate, rentals)
- Implementing "use my location" features
- Visualizing data on maps (heatmaps, clusters, polygons)

## Also Consider

- **Search Specialist** — for combining location search with text/faceted search
- **Database Specialist** — for PostGIS extensions or spatial indexing in Supabase
- **Performance Specialist** — for lazy loading maps and minimizing API costs
- **Frontend Engineer** — for responsive map layouts and mobile touch interactions
- **Data Tables Specialist** — for list + map hybrid views

## Anti-Patterns (NEVER Do)

1. ❌ Load Google Maps script eagerly on every page — lazy load only when map is visible
2. ❌ Geocode on every page load — cache coordinates in your database at write time
3. ❌ Expose API key without restrictions — always restrict by HTTP referrer and API type
4. ❌ Render 500+ markers without clustering — use MarkerClusterer for any dataset over 50 markers
5. ❌ Calculate distances client-side for search — use server-side spatial queries (Haversine or PostGIS)
6. ❌ Hardcode map center/zoom — derive from data bounds using `fitBounds()`
7. ❌ Skip the Places API Terms of Service — never cache place details longer than 30 days
8. ❌ Forget map accessibility — provide text alternatives, keyboard navigation, and ARIA labels
9. ❌ Use raw lat/lng inputs from users — always validate coordinate ranges (lat: -90..90, lng: -180..180)
10. ❌ Make distance queries without indexes — add a spatial index or use bounding box pre-filter

## Standards & Patterns

### Map Loading Strategy
```
Page loads → Placeholder div with static image or skeleton
User scrolls to map area → IntersectionObserver triggers
→ Dynamically load Google Maps script
→ Initialize map with options
→ Fetch and render markers
```

### Address → Coordinates Pipeline
```
User enters address → Places Autocomplete suggests
User selects suggestion → place_id returned
→ Geocode place_id → lat/lng + formatted_address
→ Store in DB: { address_line1, city, state, zip, country, lat, lng, place_id }
→ Never geocode again for this record
```

### Radius Search Architecture
```sql
-- Haversine formula for Supabase/Postgres (no PostGIS needed)
-- Create a database function:
CREATE OR REPLACE FUNCTION nearby_locations(
  search_lat DOUBLE PRECISION,
  search_lng DOUBLE PRECISION,
  radius_miles DOUBLE PRECISION
)
RETURNS TABLE (id UUID, name TEXT, lat DOUBLE PRECISION, lng DOUBLE PRECISION, distance_miles DOUBLE PRECISION)
AS $$
  SELECT id, name, lat, lng,
    (3959 * acos(
      cos(radians(search_lat)) * cos(radians(lat)) *
      cos(radians(lng) - radians(search_lng)) +
      sin(radians(search_lat)) * sin(radians(lat))
    )) AS distance_miles
  FROM locations
  WHERE lat BETWEEN search_lat - (radius_miles / 69.0)
    AND search_lat + (radius_miles / 69.0)
  AND lng BETWEEN search_lng - (radius_miles / (69.0 * cos(radians(search_lat))))
    AND search_lng + (radius_miles / (69.0 * cos(radians(search_lat))))
  HAVING distance_miles <= radius_miles
  ORDER BY distance_miles;
$$ LANGUAGE sql STABLE;
```

### Store Locator Page Pattern
```
┌─────────────────────────────────────────────┐
│ [Search: Address or ZIP] [Radius ▾] [Search]│
├──────────────────────┬──────────────────────┤
│                      │                      │
│   Results List       │   Interactive Map    │
│   ┌────────────┐     │                      │
│   │ Store A    │ ←──→│   📍 Marker A        │
│   │ 0.3 mi     │     │                      │
│   ├────────────┤     │        📍 B          │
│   │ Store B    │     │                      │
│   │ 1.2 mi     │     │   📍 C               │
│   ├────────────┤     │                      │
│   │ Store C    │     │                      │
│   │ 2.8 mi     │     │                      │
│   └────────────┘     │                      │
├──────────────────────┴──────────────────────┤
│ Showing 3 locations within 5 miles          │
└─────────────────────────────────────────────┘
```

### Marker Clustering Thresholds
```
0-50 markers   → Individual markers, no clustering
50-200 markers → MarkerClusterer with grid-based clustering
200-1000       → MarkerClusterer + server-side viewport filtering
1000+          → Server-side clustering, only send cluster data to client
```

### Map Component Architecture (Next.js)
```typescript
// Wrapper pattern — load Google Maps only once
'use client';

import { useEffect, useRef, useState } from 'react';

interface MapProps {
  center: { lat: number; lng: number };
  zoom?: number;
  markers?: MarkerData[];
  onMarkerClick?: (marker: MarkerData) => void;
  className?: string;
}

export function GoogleMap({ center, zoom = 12, markers = [], onMarkerClick, className }: MapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);

  // Load script once
  useEffect(() => {
    if (window.google?.maps) {
      initMap();
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = initMap;
    document.head.appendChild(script);
  }, []);

  // ... init map, add markers, handle clustering
}
```

### Info Window Pattern
```
Marker click → Open InfoWindow with:
├── Location name (linked)
├── Address
├── Phone (click-to-call on mobile)
├── Hours (highlight if open/closed NOW)
├── Distance from search point
└── [Get Directions] button → opens Google Maps native
```

### Geofencing (Service Area Validation)
```typescript
// Check if a point is inside a polygon (service area)
function isPointInServiceArea(
  point: { lat: number; lng: number },
  polygon: { lat: number; lng: number }[]
): boolean {
  // Ray-casting algorithm
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng;
    const xj = polygon[j].lat, yj = polygon[j].lng;
    const intersect = ((yi > point.lng) !== (yj > point.lng))
      && (point.lat < (xj - xi) * (point.lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
```

### Database Schema for Locations
```sql
CREATE TABLE locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'US',
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  place_id TEXT,               -- Google Place ID for refreshing
  phone TEXT,
  email TEXT,
  website TEXT,
  hours JSONB,                 -- { "mon": { "open": "09:00", "close": "17:00" }, ... }
  timezone TEXT DEFAULT 'America/Chicago',
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Bounding box index for fast spatial queries
CREATE INDEX idx_locations_lat ON locations (lat);
CREATE INDEX idx_locations_lng ON locations (lng);
CREATE INDEX idx_locations_active ON locations (is_active) WHERE is_active = true;
```

### API Cost Management
```
Google Maps Pricing (per 1,000 requests):
├── Maps JavaScript API: $7
├── Geocoding: $5
├── Places Autocomplete (per session): $2.83
├── Directions: $5-10
└── Distance Matrix: $5-10

Cost reduction strategies:
1. Cache geocoding results in DB — never geocode same address twice
2. Use session tokens for Autocomplete to bundle requests
3. Implement viewport-based loading — only fetch markers in view
4. Use static map images for non-interactive contexts
5. Rate limit geocoding API routes
6. Set daily/monthly API budget caps in Google Cloud Console
```

## Code Templates

Reference templates:
- Inline patterns above cover map component, radius search, and store locator
- Adapt the `GoogleMap` component for project-specific marker data shapes
- Use the Haversine SQL function for any proximity search feature

## Checklist

- [ ] Google Maps API key created with proper restrictions (HTTP referrer + API restrictions)
- [ ] API key stored in environment variable, not hardcoded
- [ ] Map loads lazily (IntersectionObserver or route-based)
- [ ] Markers cluster at 50+ items
- [ ] Address input uses Places Autocomplete with session tokens
- [ ] Geocoded coordinates cached in database
- [ ] Radius search uses server-side Haversine, not client-side
- [ ] Bounding box pre-filter applied before distance calculation
- [ ] Info windows show actionable data (phone, directions, hours)
- [ ] "Get Directions" links open native Google Maps
- [ ] Map has text alternative for screen readers
- [ ] Map is responsive — full width on mobile, split view on desktop
- [ ] API budget cap set in Google Cloud Console
- [ ] Location data includes timezone for accurate "open now" display
- [ ] Empty state handled ("No locations found near this address")
- [ ] Error state handled (API key invalid, geocoding failed, network error)
- [ ] Mobile: "Use my location" button leverages Geolocation API with permission prompt

## Common Pitfalls

1. **Geocoding in a loop** — If importing 500 locations, batch geocode with rate limiting (50/sec max). Never geocode synchronously in a UI loop.
2. **Stale coordinates** — If addresses change, re-geocode. Store `geocoded_at` timestamp and periodically refresh.
3. **Mixed coordinate formats** — Some APIs return `[lng, lat]` (GeoJSON) while Google uses `{ lat, lng }`. Always normalize at the boundary.
4. **Map re-renders** — React re-renders destroy and recreate maps. Use refs and memoization to keep the map instance stable.
5. **Mobile viewport** — On mobile, a full-screen map steals scroll. Use a fixed-height container or a toggle between list/map views.
6. **Missing CORS on tile requests** — If proxying map requests through your server, ensure CORS headers are correct.
7. **Places API caching violation** — Google ToS prohibits caching place details for more than 30 days. Store `place_id` and re-fetch details when needed.
8. **Timezone-unaware hours** — Showing "Open Now" requires knowing the location's timezone, not the user's. Always store and compare in location timezone.
