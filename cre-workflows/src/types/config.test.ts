import { describe, expect, it } from 'vitest';
import { configSchema } from './config';

describe('configSchema smoke', () => {
  it('accepts valid workflow configuration', () => {
    const parsed = configSchema.parse({
      healthApiEndpoint: 'https://api.medguardian.local',
      storageApi: 'https://storage.medguardian.local',
      chainSelector: 'ethereum-testnet-sepolia',
      accessControlContract: '0x0000000000000000000000000000000000000001',
      reportRegistryContract: '0x0000000000000000000000000000000000000002',
      consumerAddress: '0x0000000000000000000000000000000000000003',
      tenderlyRpcUrl: 'https://rpc.tenderly.co/fork/test',
      owner: 'workflow-owner',
    });

    expect(parsed.chainSelector).toBe('ethereum-testnet-sepolia');
    expect(parsed.consumerAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });
});
