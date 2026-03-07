import type { PatientId } from '../../types/simulation';
import { getPatientProfileRegistry } from '../patients/PatientProfileRegistry';

export interface LiveResearchCitation {
  sourceId: string;
  title: string;
  url: string;
  publishedAt: string;
  accessedAt: string;
}

type LiveResearchQuery = {
  patientId: PatientId;
  focusQuestion?: string;
  symptomCodes: string[];
  maxResults?: number;
};

const PUBMED_SEARCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';
const PUBMED_SUMMARY_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi';
const RESEARCH_TIMEOUT_MS = Number(process.env.RESEARCH_TIMEOUT_MS || 4500);

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('research timeout')), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

function mapPatientToCoreTerms(patientId: PatientId): string[] {
  const profile = getPatientProfileRegistry().getProfile(patientId);
  if (!profile) return ['symptom tracking', 'primary care triage'];
  return getPatientProfileRegistry().buildCoreResearchTerms(patientId);
}

function normalizeSymptomTerms(symptomCodes: string[]): string[] {
  return symptomCodes
    .map((code) => code.replace(/_/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 4);
}

function parsePubDate(raw: string | undefined): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return new Date().toISOString().slice(0, 10);
  return new Date(parsed).toISOString().slice(0, 10);
}

export class MedicalResearchService {
  private readonly enabled: boolean;
  private readonly apiKey?: string;

  constructor() {
    const envEnabled = process.env.ENABLE_LIVE_RESEARCH;
    this.enabled = envEnabled ? ['1', 'true', 'yes', 'on'].includes(envEnabled.toLowerCase()) : true;
    this.apiKey = process.env.PUBMED_API_KEY?.trim();
  }

  async queryLatestEvidence(input: LiveResearchQuery): Promise<LiveResearchCitation[]> {
    if (!this.enabled) return [];
    if (process.env.NODE_ENV === 'test') return [];

    const terms = [
      ...mapPatientToCoreTerms(input.patientId),
      ...normalizeSymptomTerms(input.symptomCodes),
      input.focusQuestion?.trim() || '',
    ]
      .filter(Boolean)
      .slice(0, 6);

    if (!terms.length) return [];

    const maxResults = Math.max(1, Math.min(input.maxResults ?? 5, 10));
    const query = `${terms.map((term) => `(${term})`).join(' AND ')} AND (guideline OR trial OR review)`;
    const ids = await this.searchPubMedIds(query, maxResults);
    if (!ids.length) return [];

    return this.fetchPubMedSummaries(ids);
  }

  getStatus(): {
    enabled: boolean;
    provider: 'pubmed';
    apiKeyConfigured: boolean;
    mode: 'live' | 'disabled';
  } {
    return {
      enabled: this.enabled,
      provider: 'pubmed',
      apiKeyConfigured: Boolean(this.apiKey),
      mode: this.enabled ? 'live' : 'disabled',
    };
  }

  private async searchPubMedIds(query: string, maxResults: number): Promise<string[]> {
    const params = new URLSearchParams({
      db: 'pubmed',
      retmode: 'json',
      sort: 'pub+date',
      retmax: String(maxResults),
      term: query,
    });
    if (this.apiKey) params.set('api_key', this.apiKey);

    const response = await withTimeout(
      fetch(`${PUBMED_SEARCH_URL}?${params.toString()}`),
      RESEARCH_TIMEOUT_MS
    );
    if (!response.ok) return [];

    const payload = await response.json() as {
      esearchresult?: { idlist?: string[] };
    };
    return Array.isArray(payload.esearchresult?.idlist) ? payload.esearchresult!.idlist : [];
  }

  private async fetchPubMedSummaries(ids: string[]): Promise<LiveResearchCitation[]> {
    const params = new URLSearchParams({
      db: 'pubmed',
      retmode: 'json',
      id: ids.join(','),
    });
    if (this.apiKey) params.set('api_key', this.apiKey);

    const response = await withTimeout(
      fetch(`${PUBMED_SUMMARY_URL}?${params.toString()}`),
      RESEARCH_TIMEOUT_MS
    );
    if (!response.ok) return [];

    const payload = await response.json() as {
      result?: Record<string, { uid?: string; title?: string; pubdate?: string }>;
    };
    const result = payload.result || {};
    const accessedAt = new Date().toISOString().slice(0, 10);

    return ids
      .map((id) => {
        const row = result[id];
        if (!row?.uid || !row.title) return null;
        return {
          sourceId: `PMID-${row.uid}`,
          title: row.title,
          url: `https://pubmed.ncbi.nlm.nih.gov/${row.uid}/`,
          publishedAt: parsePubDate(row.pubdate),
          accessedAt,
        } satisfies LiveResearchCitation;
      })
      .filter((item): item is LiveResearchCitation => Boolean(item));
  }
}

let service: MedicalResearchService | null = null;

export function getMedicalResearchService(): MedicalResearchService {
  if (!service) {
    service = new MedicalResearchService();
  }
  return service;
}
