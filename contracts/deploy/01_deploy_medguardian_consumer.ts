import { ethers, network } from 'hardhat';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const DEFAULT_FORWARDER_BY_NETWORK: Record<string, string> = {
  sepolia: '0x15fC6ae953E024d975e77382eEeC56A9101f9F88',
};

function readDeploymentFile(path: string): Record<string, unknown> {
  if (!existsSync(path)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const forwarderAddress = process.env.CRE_FORWARDER_ADDRESS || DEFAULT_FORWARDER_BY_NETWORK[network.name];

  if (!forwarderAddress) {
    throw new Error(
      `Missing CRE_FORWARDER_ADDRESS for network "${network.name}". ` +
      'Set it explicitly or deploy to a network with a known default forwarder.'
    );
  }

  console.log('----------------------------------------');
  console.log(`Deploying MedGuardianConsumer to ${network.name}...`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Forwarder: ${forwarderAddress}`);

  const factory = await ethers.getContractFactory('MedGuardianConsumer', deployer);
  const contract = await factory.deploy(forwarderAddress);
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();

  console.log(`MedGuardianConsumer deployed at: ${contractAddress}`);
  const deploymentsDir = join(__dirname, '..', 'deployments');
  mkdirSync(deploymentsDir, { recursive: true });
  const deploymentFile = join(deploymentsDir, `${network.name}.json`);
  const existing = readDeploymentFile(deploymentFile);

  writeFileSync(
    deploymentFile,
    JSON.stringify(
      {
        ...existing,
        network: network.name,
        deployedAt: new Date().toISOString(),
        deployer: deployer.address,
        medGuardianConsumer: contractAddress,
        creForwarder: forwarderAddress,
      },
      null,
      2
    )
  );

  console.log(`Deployment manifest written to: ${deploymentFile}`);
  console.log('Suggested config updates:');
  console.log(`  consumerAddress=${contractAddress}`);
  console.log(`  reportRegistryContract=${contractAddress}`);
  console.log(`  CRE forwarder=${forwarderAddress}`);
  console.log('----------------------------------------');
}

main().catch((error) => {
  console.error('Deployment failed:', error);
  process.exit(1);
});
