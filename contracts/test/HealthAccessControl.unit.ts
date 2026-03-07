import { expect } from 'chai';
import { ethers } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import type { HealthAccessControl } from '../typechain-types';

describe('HealthAccessControl unit', function () {
  async function deployFixture() {
    const [owner, patient, doctor, issuer, outsider] = await ethers.getSigners();
    const factory = await ethers.getContractFactory('HealthAccessControl');
    const contract = (await factory.connect(owner).deploy()) as unknown as HealthAccessControl;
    await contract.waitForDeployment();

    return { contract, owner, patient, doctor, issuer, outsider };
  }

  it('grants access and enforces bitmask query permissions', async function () {
    const { contract, patient, doctor } = await deployFixture();
    const bitmask = (1n << 0n) | (1n << 3n);
    const allowedQueries = ethers.zeroPadValue(ethers.toBeHex(bitmask), 32);

    await expect(contract.connect(patient).grantAccess(doctor.address, 3600, allowedQueries))
      .to.emit(contract, 'AccessGranted');

    const [isValid, expiry, allowed] = await contract.checkAccess(patient.address, doctor.address);
    expect(isValid).to.equal(true);
    expect(expiry).to.be.greaterThan(0n);
    expect(allowed).to.equal(allowedQueries);

    expect(await contract.isQueryAllowed(patient.address, doctor.address, 0)).to.equal(true);
    expect(await contract.isQueryAllowed(patient.address, doctor.address, 3)).to.equal(true);
    expect(await contract.isQueryAllowed(patient.address, doctor.address, 2)).to.equal(false);
  });

  it('rejects invalid grant inputs', async function () {
    const { contract, patient, doctor } = await deployFixture();
    const allowedQueries = ethers.zeroPadValue('0x1f', 32);

    await expect(
      contract.connect(patient).grantAccess(ethers.ZeroAddress, 3600, allowedQueries)
    ).to.be.revertedWith('Invalid doctor address');

    await expect(
      contract.connect(patient).grantAccess(patient.address, 3600, allowedQueries)
    ).to.be.revertedWith('Cannot grant access to self');

    await expect(
      contract.connect(patient).grantAccess(doctor.address, 0, allowedQueries)
    ).to.be.revertedWith('Invalid duration');
  });

  it('extends access from current timestamp when prior grant is expired', async function () {
    const { contract, patient, doctor } = await deployFixture();
    const allowedQueries = ethers.zeroPadValue('0x1f', 32);

    await contract.connect(patient).grantAccess(doctor.address, 120, allowedQueries);
    await time.increase(300);

    const tx = await contract.connect(patient).extendAccess(doctor.address, 600);
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt!.blockNumber);
    const grant = await contract.accessGrants(patient.address, doctor.address);

    expect(grant.active).to.equal(true);
    expect(grant.expiry).to.equal(BigInt(block!.timestamp) + 600n);
  });

  it('revokes access and disables subsequent access checks', async function () {
    const { contract, patient, doctor } = await deployFixture();
    const allowedQueries = ethers.zeroPadValue('0x1f', 32);

    await contract.connect(patient).grantAccess(doctor.address, 3600, allowedQueries);
    await expect(contract.connect(patient).revokeAccess(doctor.address))
      .to.emit(contract, 'AccessRevoked');

    const [isValid, expiry, allowedQueriesAfter] = await contract.checkAccess(
      patient.address,
      doctor.address
    );
    expect(isValid).to.equal(false);
    expect(expiry).to.equal(0n);
    expect(allowedQueriesAfter).to.equal(ethers.ZeroHash);
  });

  it('restricts onReport to authorized issuer addresses', async function () {
    const { contract, patient, outsider } = await deployFixture();
    const reportHash = ethers.keccak256(ethers.toUtf8Bytes('unauthorized-report'));
    const encodedReport = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'bytes32', 'string', 'uint256'],
      [patient.address, reportHash, 'cid://unauthorized', 1_735_689_600]
    );

    await expect(contract.connect(outsider).onReport('0x', encodedReport)).to.be.revertedWith(
      'Unauthorized issuer'
    );
  });

  it('authorizes issuer for report ingestion/logging and blocks after deauthorization', async function () {
    const { contract, owner, patient, doctor, issuer } = await deployFixture();
    const reportHash = ethers.keccak256(ethers.toUtf8Bytes('authorized-report'));
    const encodedReport = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'bytes32', 'string', 'uint256'],
      [patient.address, reportHash, 'cid://authorized', 1_735_689_600]
    );

    await expect(contract.connect(owner).authorizeIssuer(issuer.address))
      .to.emit(contract, 'IssuerAuthorized')
      .withArgs(issuer.address);

    await expect(contract.connect(issuer).onReport('0x', encodedReport))
      .to.emit(contract, 'ReportRegistered');

    const reportIds = await contract.getPatientReportIds(patient.address);
    expect(reportIds).to.have.length(1);
    const report = await contract.getReport(patient.address, reportIds[0]);
    expect(report.reportHash).to.equal(reportHash);
    expect(report.encryptedCid).to.equal('cid://authorized');
    expect(report.issuer).to.equal(issuer.address);

    await expect(
      contract.connect(issuer).logAccess(patient.address, doctor.address, 'vitals', reportIds[0])
    ).to.emit(contract, 'AccessLogRecorded');

    await expect(contract.connect(owner).deauthorizeIssuer(issuer.address))
      .to.emit(contract, 'IssuerDeauthorized')
      .withArgs(issuer.address);

    await expect(contract.connect(issuer).onReport('0x', encodedReport)).to.be.revertedWith(
      'Unauthorized issuer'
    );
  });

  it('emits RequestCreated and validates request arguments', async function () {
    const { contract, doctor } = await deployFixture();
    const commitId = ethers.keccak256(ethers.toUtf8Bytes('request-commit'));

    await expect(
      contract.connect(doctor).createRequest(
        'sarah',
        'dr_chen',
        commitId,
        'fatigue_intake_pack_v1',
        ['vitals', 'symptoms'],
        24
      )
    ).to.emit(contract, 'RequestCreated').withArgs(
      anyValue,
      'sarah',
      'dr_chen',
      commitId,
      'fatigue_intake_pack_v1',
      ['vitals', 'symptoms'],
      24,
      anyValue,
      doctor.address
    );

    await expect(
      contract.connect(doctor).createRequest(
        'sarah',
        'dr_chen',
        ethers.ZeroHash,
        'fatigue_intake_pack_v1',
        ['vitals'],
        24
      )
    ).to.be.revertedWith('Invalid commitId');
  });
});
