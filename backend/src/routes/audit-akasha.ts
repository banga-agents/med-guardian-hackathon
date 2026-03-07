import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { getAkashaSymptomService } from '../services/akasha/AkashaSymptomService';

const router = Router();
const CRE_SERVICE_HEADER = 'x-cre-service-key';

const AnchorSchema = z.object({
  eventId: z.string().min(1).max(120),
  workflowId: z.string().min(2).max(120).optional(),
  anchoredBy: z.string().min(2).max(120).optional(),
});

function resolveTraceId(req: { headers: { [key: string]: any } }): string {
  const header = req.headers['x-trace-id'];
  if (typeof header === 'string' && header.trim().length > 0) {
    return header.trim().slice(0, 120);
  }
  return `trace-${randomUUID()}`;
}

const parseMutationKey = (): string | null => {
  const configured =
    process.env.CRE_MUTATION_API_KEY
    || process.env.CRE_PRIVATE_SUMMARY_KEY
    || '';

  const value = configured.trim();
  if (!value) return null;
  if (/^your[_-]|placeholder|example|changeme/i.test(value)) {
    return null;
  }
  return value;
};

const resolveOnchainAuditPermission = (req: Request, res: Response): boolean | null => {
  const provided = req.header(CRE_SERVICE_HEADER) || '';
  if (!provided) {
    return false;
  }

  const expectedKey = parseMutationKey();
  if (!expectedKey) {
    res.status(503).json({
      success: false,
      error: 'CRE mutation service key is not configured',
    });
    return null;
  }

  if (provided !== expectedKey) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized audit anchor request',
    });
    return null;
  }

  return true;
};

router.post('/anchor', async (req, res) => {
  try {
    const payload = AnchorSchema.parse(req.body);
    const traceId = resolveTraceId(req);
    const allowOnchain = resolveOnchainAuditPermission(req, res);
    if (allowOnchain === null) {
      return;
    }
    const service = getAkashaSymptomService();

    const result = await service.anchorAuditEvent({
      eventId: payload.eventId,
      workflowId: payload.workflowId,
      anchoredBy: payload.anchoredBy,
      traceId,
      allowOnchain,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/verify/:event_id', (req, res) => {
  try {
    const eventId = z.string().min(1).max(120).parse(req.params.event_id);
    const traceId = resolveTraceId(req);
    const service = getAkashaSymptomService();

    const result = service.verifyAuditEvent({
      eventId,
      traceId,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export function setupAkashaAuditRoutes(): Router {
  return router;
}
