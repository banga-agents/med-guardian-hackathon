import { expect } from 'chai';
import { ethers } from 'hardhat';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import type { HealthAccessControl } from '../typechain-types';

describe('HealthAccessControl smoke', function () {
  it('grants access and stores a report', async function () {
    const [owner, patient, doctor] = await ethers.getSigners();

    const factory = await ethers.getContractFactory('HealthAccessControl');
    const contract = (await factory.connect(owner).deploy()) as unknown as HealthAccessControl;
    await contract.waitForDeployment();

    const allowedQueries = ethers.zeroPadValue('0x1f', 32);

    await expect(
      contract.connect(patient).grantAccess(doctor.address, 3600, allowedQueries)
    ).to.emit(contract, 'AccessGranted');

    const [isValid] = await contract.checkAccess(patient.address, doctor.address);
    expect(isValid).to.equal(true);

    const reportHash = ethers.keccak256(ethers.toUtf8Bytes('smoke-report'));
    const generatedAt = BigInt(Math.floor(Date.now() / 1000));
    const encodedReport = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'bytes32', 'string', 'uint256'],
      [patient.address, reportHash, 'cid://encrypted-report', generatedAt]
    );

    await expect(contract.connect(owner).onReport('0x', encodedReport)).to.emit(
      contract,
      'ReportRegistered'
    );

    expect(await contract.getPatientReportCount(patient.address)).to.equal(1n);

    const commitId = ethers.keccak256(ethers.toUtf8Bytes('commit-smoke'));
    await expect(
      contract.connect(doctor).createRequest(
        'sarah',
        'dr_chen',
        commitId,
        'fatigue_intake_pack_v1',
        ['vitals', 'symptoms'],
        24
      )
    )
      .to.emit(contract, 'RequestCreated')
      .withArgs(
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
  });
});
