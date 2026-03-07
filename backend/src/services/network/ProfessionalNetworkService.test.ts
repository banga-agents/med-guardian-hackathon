import { afterEach, describe, expect, it } from 'vitest';
import { ProfessionalNetworkService } from './ProfessionalNetworkService.js';

const ORIGINAL_FLAGS = {
  ENABLE_PRO_NETWORK: process.env.ENABLE_PRO_NETWORK,
  ENABLE_MARKETPLACE_TASKS: process.env.ENABLE_MARKETPLACE_TASKS,
  ENABLE_PAYOUTS: process.env.ENABLE_PAYOUTS,
};

function restoreFlags() {
  for (const [key, value] of Object.entries(ORIGINAL_FLAGS)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

afterEach(() => {
  restoreFlags();
});

describe('ProfessionalNetworkService feature flags', () => {
  it('defaults the collaborative network features on when flags are unset', () => {
    delete process.env.ENABLE_PRO_NETWORK;
    delete process.env.ENABLE_MARKETPLACE_TASKS;
    delete process.env.ENABLE_PAYOUTS;

    const service = new ProfessionalNetworkService();

    expect(service.isEnabled()).toBe(true);
    expect(service.isMarketplaceEnabled()).toBe(true);
    expect(service.isPayoutEnabled()).toBe(true);
  });

  it('allows explicit false overrides for operators who want modules off', () => {
    process.env.ENABLE_PRO_NETWORK = 'false';
    process.env.ENABLE_MARKETPLACE_TASKS = 'false';
    process.env.ENABLE_PAYOUTS = 'false';

    const service = new ProfessionalNetworkService();

    expect(service.isEnabled()).toBe(false);
    expect(service.isMarketplaceEnabled()).toBe(false);
    expect(service.isPayoutEnabled()).toBe(false);
  });
});
