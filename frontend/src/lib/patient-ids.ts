import type { PatientId } from '@/types/simulation';

export const PERSONAL_PATIENT_ID = 'self' as const satisfies PatientId;

export const DISPLAY_PATIENT_IDS = ['self', 'sarah', 'robert', 'emma', 'michael'] as const satisfies readonly PatientId[];

export const SIMULATED_PATIENT_IDS = ['sarah', 'robert', 'emma', 'michael'] as const satisfies readonly PatientId[];
