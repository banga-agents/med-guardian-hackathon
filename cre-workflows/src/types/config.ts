import { z } from "zod";

/**
 * Configuration schema for MedGuardian CRE workflows
 * Validated using Zod for runtime type safety
 */
export const configSchema = z.object({
  // API Endpoints
  healthApiEndpoint: z.string().url(),
  storageApi: z.string().url(),
  aiEndpoint: z.string().url().optional(),

  // Blockchain Configuration
  chainSelector: z.string().default("ethereum-testnet-sepolia"),
  accessControlContract: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  accessRevokedEventSignature: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
  reportRegistryContract: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  consumerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  tenderlyRpcUrl: z.string().url(),
  tenderlyExplorerBase: z.string().url().optional(),

  // Confidential summary fetch policy
  allowHttpFallback: z.boolean().default(true),
  confidentialSummaryHeaderName: z.string().default('X-CRE-Service-Key'),
  enableAccessRevocationTrigger: z.boolean().default(true),

  // Workflow Owner
  owner: z.string(),
});

export type Config = z.infer<typeof configSchema>;

/**
 * Chain selectors for supported networks
 */
export const ChainSelectors = {
  ETHEREUM_MAINNET: "ETHEREUM_MAINNET",
  ETHEREUM_SEPOLIA: "ETHEREUM_SEPOLIA",
  ETHEREUM_TESTNET_SEPOLIA: "ethereum-testnet-sepolia",
  POLYGON_MAINNET: "POLYGON_MAINNET",
  POLYGON_MUMBAI: "POLYGON_MUMBAI",
  ARBITRUM_ONE: "ARBITRUM_ONE",
  OPTIMISM_MAINNET: "OPTIMISM_MAINNET",
  BASE_MAINNET: "BASE_MAINNET",
  AVALANCHE_C_CHAIN: "AVALANCHE_C_CHAIN",
} as const;

export type ChainSelector =
  (typeof ChainSelectors)[keyof typeof ChainSelectors];
