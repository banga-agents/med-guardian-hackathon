/**
 * Health data types for MedGuardian
 * Aligned with FHIR R4 standard where applicable
 */

export type DataType = "symptom" | "medication" | "vital" | "diet" | "mood";

export interface HealthLogPayload {
  /** Hashed patient identifier */
  patientId: string;
  /** AES-GCM encrypted health log data */
  encryptedData: string;
  /** Unix timestamp of the log entry */
  timestamp: number;
  /** Type of health data */
  dataType: DataType;
  /** Optional: IPFS CID of previous log (for chain) */
  previousCid?: string;
}

export interface SymptomEntry {
  symptom: string;
  severity: 1 | 2 | 3 | 4 | 5;
  location?: string;
  duration?: string;
  triggers?: string[];
  notes?: string;
}

export interface MedicationEntry {
  name: string;
  dosage: string;
  frequency: string;
  taken: boolean;
  takenAt?: number;
  sideEffects?: string[];
}

export interface VitalEntry {
  type: "heart_rate" | "blood_pressure" | "temperature" | "weight" | "glucose";
  value: number;
  unit: string;
  measuredAt: number;
  deviceId?: string;
}

export interface DietEntry {
  meal: string;
  foods: string[];
  calories?: number;
  macronutrients?: {
    protein?: number;
    carbs?: number;
    fat?: number;
  };
  timestamp: number;
}

export interface HealthReport {
  /** Hashed patient identifier */
  patientHash: string;
  /** Report time period */
  reportPeriod: {
    start: number;
    end: number;
  };
  /** IPFS CID of encrypted report */
  summaryCid: string;
  /** SHA-256 hash of report for on-chain verification */
  summaryHash: string;
  /** Extracted symptom timeline */
  symptomTimeline: string[];
  /** AI-generated insights summary */
  aiInsights: string;
  /** FHIR-compliant formatted data */
  fhirBundle?: string;
  /** Report generation timestamp */
  generatedAt: number;
}

export interface DoctorRequest {
  /** Doctor's wallet address */
  doctorAddress: string;
  /** Hashed patient identifier */
  patientId: string;
  /** Type of health data requested */
  queryType: "symptoms" | "medications" | "vitals" | "full_summary";
  /** Time range for the query */
  timeRange: {
    start: number;
    end: number;
  };
  /** Unique nonce for request validation */
  nonce: string;
  /** Doctor's cryptographic signature */
  signature: string;
}

export interface AccessGrant {
  doctor: string;
  expiry: number;
  allowedQueries: string; // Bitmask
  active: boolean;
}

export interface ReportDispatchPayload {
  patient?: `0x${string}`;
  patientId?: string;
  commitId?: `0x${string}`;
  reportHash?: `0x${string}`;
  encryptedCid?: string;
  generatedAt?: number;
  featureWindowHours?: number;
  derivedFeatures?: {
    baselineCount: number;
    recentCount: number;
    drift: {
      heartRate: number | null;
      systolic: number | null;
      oxygenSaturation: number | null;
      bloodGlucose: number | null;
    };
    changePoints: string[];
    anomalyBursts: {
      tachycardia: number;
      hypertension: number;
      oxygenDrop: number;
      glucoseSpike: number;
    };
  };
  gasLimit?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Bitmask for query permissions
 */
export const QueryPermissions = {
  SYMPTOMS: 1 << 0, // 1
  MEDICATIONS: 1 << 1, // 2
  VITALS: 1 << 2, // 4
  DIET: 1 << 3, // 8
  FULL_SUMMARY: 1 << 4, // 16
} as const;

export function hasPermission(
  allowedQueries: string | number,
  permission: number
): boolean {
  const allowed =
    typeof allowedQueries === "string"
      ? parseInt(allowedQueries, 16)
      : allowedQueries;
  return (allowed & permission) !== 0;
}

export function encodePermissions(permissions: number[]): string {
  const bitmask = permissions.reduce((acc, perm) => acc | perm, 0);
  return "0x" + bitmask.toString(16).padStart(64, "0");
}
