export type IntersectionType = '4way' | 'tee' | 'midblock' | 'roundabout' | 'custom';
export type CrossingDirection = 'NS' | 'EW';
export type TimePeriod = 'am_peak' | 'pm_peak' | 'off_peak';
export type VehicleType = string; // user-defined; defaults: Moto, Car, Rickshaw, Other
export type Movement = 'left' | 'straight' | 'right';

export interface Session {
  id: string;                        // "sess_YYYYMMDD_HHmmss_mmm"
  location_name: string;
  intersection_type: IntersectionType;
  time_period: TimePeriod;
  lat: number | null;
  lng: number | null;
  custom_legs: string[] | null;      // up to 6 leg names; null for standard types
  started_at: string;                // ISO 8601
  ended_at: string | null;
  total_count: number;
  color_tag: string | null;          // macOS-style color label hex, or null
}

export interface Count {
  id: number;
  session_id: string;
  from_direction: string;
  movement: Movement;
  to_direction: string;              // computed and stored — never re-derived
  vehicle_type: VehicleType;
  timestamp: string;                 // ISO 8601
}

export interface CreateSessionInput {
  location_name: string;
  intersection_type: IntersectionType;
  time_period: TimePeriod;
  lat: number | null;
  lng: number | null;
  custom_legs?: string[];
}

export interface PedestrianCount {
  id: number;
  session_id: string;
  crossing_direction: CrossingDirection | null;
  timestamp: string;
}

export interface RecordCountInput {
  from_direction: string;
  movement: Movement;
  vehicle_type: VehicleType;
}
