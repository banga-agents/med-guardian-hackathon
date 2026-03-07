import { ethers, network } from 'hardhat';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

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

  console.log('----------------------------------------');
  console.log(`Deploying HealthAccessControl to ${network.name}...`);
  console.log(`Deployer: ${deployer.address}`);

  const factory = await ethers.getContractFactory('HealthAccessControl', deployer);
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();

  console.log(`HealthAccessControl deployed at: ${contractAddress}`);
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
        healthAccessControl: contractAddress,
      },
      null,
      2
    )
  );
  console.log(`Deployment manifest written to: ${deploymentFile}`);
  console.log('----------------------------------------');

  if (network.name !== 'hardhat' && network.name !== 'localhost') {
    console.log('To verify the contract, run:');
    console.log(`npx hardhat verify --network ${network.name} ${contractAddress}`);
  }
}

main().catch((error) => {
  console.error('Deployment failed:', error);
  process.exit(1);
});
