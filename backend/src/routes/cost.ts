import { Router } from 'express';
import { z } from 'zod';
import { getReceiptStore } from '../services/cre/ReceiptStore';
import type { ApiEnvelope } from '../types/simulation';

const router = Router();

const QuerySchema = z.object({
  windowHours: z.coerce.number().int().min(1).max(720).default(24),
});

type CostOverviewPayload = ReturnType<typeof getReceiptStore> extends {
  getCostOverview: (...args: any[]) => infer T;
}
  ? T
  : never;

router.get('/overview', (req, res) => {
  try {
    const { windowHours } = QuerySchema.parse(req.query);
    const data = getReceiptStore().getCostOverview(windowHours);
    const response: ApiEnvelope<CostOverviewPayload> = {
      success: true,
      data,
    };
    res.json(response);
  } catch (error: any) {
    const response: ApiEnvelope<CostOverviewPayload> = {
      success: false,
      error: error.message,
    };
    res.status(400).json(response);
  }
});

export function setupCostRoutes(): Router {
  return router;
}
