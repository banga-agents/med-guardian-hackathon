import { z } from 'zod';
import type { PatientId } from '../types/simulation';

export const PERSONAL_PATIENT_ID = 'self' as const satisfies PatientId;

export const ALL_PATIENT_IDS = ['self', 'sarah', 'robert', 'emma', 'michael'] as const;

export const SIMULATED_PATIENT_IDS = ['sarah', 'robert', 'emma', 'michael'] as const;

export type SimulatedPatientId = (typeof SIMULATED_PATIENT_IDS)[number];

export const PatientIdSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]*$/i, 'Invalid patient ID');
