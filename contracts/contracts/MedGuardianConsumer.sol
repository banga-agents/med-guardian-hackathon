// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {ReceiverTemplate} from "./ReceiverTemplate.sol";

/// @title MedGuardianConsumer
/// @notice Stores attested health summaries emitted by the CRE workflow.
contract MedGuardianConsumer is ReceiverTemplate {
    struct AttestedReport {
        bytes32 patientIdHash;
        uint8 severity;
        bytes32 reportHash;
        uint64 timestamp;
    }

    mapping(bytes32 => AttestedReport) public latestByPatient;

    event ReportAttested(bytes32 indexed patientIdHash, uint8 severity, bytes32 reportHash, uint64 timestamp);

    constructor(address forwarder) ReceiverTemplate(forwarder) {}

    function _processReport(bytes calldata report) internal override {
        AttestedReport memory r = abi.decode(report, (AttestedReport));
        latestByPatient[r.patientIdHash] = r;
        emit ReportAttested(r.patientIdHash, r.severity, r.reportHash, r.timestamp);
    }
}
