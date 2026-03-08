// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
pragma solidity ^0.8.19;

import {IERC165} from "./IERC165.sol";
import {IReceiver} from "./IReceiver.sol";

/**
 * @title HealthAccessControl
 * @dev Manages patient-controlled access to health data for doctors
 *      Receives verifiable health reports from Chainlink CRE workflows
 *      Implements IReceiver for CRE workflow integration
 */
contract HealthAccessControl is IReceiver {
    // ============ Structs ============

    /**
     * @notice Represents an access grant from patient to doctor
     */
    struct AccessGrant {
        address doctor;
        uint256 expiry;
        bytes32 allowedQueries; // Bitmask of allowed query types
        bool active;
    }

    /**
     * @notice Represents a registered health report
     */
    struct HealthReport {
        bytes32 reportHash;
        uint256 timestamp;
        string encryptedCid; // Encrypted IPFS CID
        address issuer; // Should be verified KeystoneForwarder
    }

    /**
     * @notice Represents an access log entry for audit trail
     */
    struct AccessLog {
        address doctor;
        string queryType;
        uint256 timestamp;
        bytes32 reportId;
    }

    // ============ State Variables ============

    // Patient => Doctor => AccessGrant
    mapping(address => mapping(address => AccessGrant)) public accessGrants;

    // Patient => ReportId => HealthReport
    mapping(address => mapping(bytes32 => HealthReport)) public healthReports;

    // Patient => AccessLog[] (circular buffer for gas efficiency)
    mapping(address => AccessLog[100]) public accessLogs;
    mapping(address => uint256) public accessLogCount;
    mapping(address => uint256) public accessLogIndex;

    // Authorized CRE workflow addresses (KeystoneForwarder)
    mapping(address => bool) public authorizedIssuers;

    // Contract owner
    address public owner;

    // Patient => ReportId[] for enumeration
    mapping(address => bytes32[]) public patientReportIds;
    mapping(address => mapping(bytes32 => uint256)) public reportIdIndex;

    // ============ Events ============

    event AccessGranted(
        address indexed patient,
        address indexed doctor,
        uint256 expiry,
        bytes32 allowedQueries
    );

    event AccessRevoked(address indexed patient, address indexed doctor);

    event AccessExtended(
        address indexed patient,
        address indexed doctor,
        uint256 newExpiry
    );

    event ReportRegistered(
        address indexed patient,
        bytes32 indexed reportId,
        bytes32 reportHash,
        string encryptedCid
    );

    event AccessLogRecorded(
        address indexed patient,
        address indexed doctor,
        string queryType,
        uint256 timestamp
    );

    event IssuerAuthorized(address indexed issuer);
    event IssuerDeauthorized(address indexed issuer);
    event RequestCreated(
        bytes32 indexed requestId,
        string patientId,
        string doctorId,
        bytes32 commitId,
        string purpose,
        string[] categories,
        uint16 windowHours,
        uint256 createdAt,
        address indexed requester
    );

    // ============ Modifiers ============

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyAuthorizedIssuer() {
        require(
            authorizedIssuers[msg.sender] || msg.sender == owner,
            "Unauthorized issuer"
        );
        _;
    }

    // ============ Constructor ============

    constructor() {
        owner = msg.sender;
        authorizedIssuers[msg.sender] = true;
    }

    // ============ Access Control Functions ============

    /**
     * @notice Patient grants access to a doctor
     * @param doctor Address of the doctor being granted access
     * @param duration Duration in seconds for which access is granted
     * @param allowedQueries Bitmask of allowed query types
     */
    function grantAccess(
        address doctor,
        uint256 duration,
        bytes32 allowedQueries
    ) external {
        require(doctor != address(0), "Invalid doctor address");
        require(doctor != msg.sender, "Cannot grant access to self");
        require(duration > 0 && duration <= 365 days, "Invalid duration");

        uint256 expiry = block.timestamp + duration;

        accessGrants[msg.sender][doctor] = AccessGrant({
            doctor: doctor,
            expiry: expiry,
            allowedQueries: allowedQueries,
            active: true
        });

        emit AccessGranted(msg.sender, doctor, expiry, allowedQueries);
    }

    /**
     * @notice Patient extends an existing access grant
     * @param doctor Address of the doctor
     * @param additionalDuration Additional time in seconds
     */
    function extendAccess(
        address doctor,
        uint256 additionalDuration
    ) external {
        require(doctor != address(0), "Invalid doctor address");
        require(additionalDuration > 0, "Invalid duration");

        AccessGrant storage grant = accessGrants[msg.sender][doctor];
        require(grant.active, "No active grant");

        uint256 currentExpiry = grant.expiry;
        if (currentExpiry < block.timestamp) {
            currentExpiry = block.timestamp;
        }

        uint256 newExpiry = currentExpiry + additionalDuration;
        require(
            newExpiry <= block.timestamp + 365 days,
            "Exceeds max duration"
        );

        grant.expiry = newExpiry;

        emit AccessExtended(msg.sender, doctor, newExpiry);
    }

    /**
     * @notice Patient revokes doctor's access
     * @param doctor Address of the doctor
     */
    function revokeAccess(address doctor) external {
        require(doctor != address(0), "Invalid doctor address");
        require(accessGrants[msg.sender][doctor].active, "No active grant");

        delete accessGrants[msg.sender][doctor];

        emit AccessRevoked(msg.sender, doctor);
    }

    /**
     * @notice Check if doctor has valid access
     * @param patient Address of the patient
     * @param doctor Address of the doctor
     * @return isValid Whether access is valid
     * @return expiry Timestamp when access expires
     * @return allowedQueries Bitmask of allowed query types
     */
    function checkAccess(
        address patient,
        address doctor
    )
        external
        view
        returns (bool isValid, uint256 expiry, bytes32 allowedQueries)
    {
        AccessGrant memory grant = accessGrants[patient][doctor];
        isValid = grant.active && block.timestamp < grant.expiry;
        expiry = grant.expiry;
        allowedQueries = grant.allowedQueries;
    }

    /**
     * @notice Check if a specific query type is allowed
     * @param patient Address of the patient
     * @param doctor Address of the doctor
     * @param queryType Permission bit to check
     * @return allowed Whether the query type is allowed
     */
    function isQueryAllowed(
        address patient,
        address doctor,
        uint8 queryType
    ) external view returns (bool allowed) {
        AccessGrant memory grant = accessGrants[patient][doctor];
        if (!grant.active || block.timestamp >= grant.expiry) {
            return false;
        }
        uint256 permissionBit = uint256(grant.allowedQueries) & (1 << queryType);
        return permissionBit != 0;
    }

    /**
     * @notice Create an auditable workflow request for CRE processing.
     * @dev Emits RequestCreated so off-chain workflow listeners can trigger the golden path.
     */
    function createRequest(
        string calldata patientId,
        string calldata doctorId,
        bytes32 commitId,
        string calldata purpose,
        string[] calldata categories,
        uint16 windowHours
    ) external returns (bytes32 requestId) {
        require(bytes(patientId).length > 0, "Invalid patientId");
        require(bytes(doctorId).length > 0, "Invalid doctorId");
        require(bytes(purpose).length > 0, "Invalid purpose");
        require(commitId != bytes32(0), "Invalid commitId");
        require(categories.length > 0 && categories.length <= 16, "Invalid categories");
        require(windowHours > 0 && windowHours <= 720, "Invalid windowHours");

        requestId = keccak256(
            abi.encode(
                msg.sender,
                patientId,
                doctorId,
                commitId,
                purpose,
                categories,
                windowHours,
                block.chainid,
                block.timestamp,
                block.number
            )
        );

        emit RequestCreated(
            requestId,
            patientId,
            doctorId,
            commitId,
            purpose,
            categories,
            windowHours,
            block.timestamp,
            msg.sender
        );
    }

    // ============ Report Management (IReceiver) ============

    /**
     * @notice Receive reports from CRE workflow (IReceiver implementation)
     * @param metadata Additional metadata about the report
     * @param report ABI-encoded report data
     */
    function onReport(
        bytes calldata metadata,
        bytes calldata report
    ) external override onlyAuthorizedIssuer {
        // Decode report: (address patient, bytes32 reportHash, string encryptedCid, uint256 generatedAt)
        (
            address patient,
            bytes32 reportHash,
            string memory encryptedCid,
            uint256 generatedAt
        ) = abi.decode(report, (address, bytes32, string, uint256));

        require(patient != address(0), "Invalid patient");
        require(reportHash != bytes32(0), "Invalid hash");
        require(bytes(encryptedCid).length > 0, "Invalid CID");

        // Generate unique report ID
        bytes32 reportId = keccak256(
            abi.encodePacked(
                patient,
                reportHash,
                generatedAt,
                block.timestamp,
                block.number
            )
        );

        // Store report
        healthReports[patient][reportId] = HealthReport({
            reportHash: reportHash,
            timestamp: generatedAt,
            encryptedCid: encryptedCid,
            issuer: msg.sender
        });

        // Add to patient's report list
        patientReportIds[patient].push(reportId);
        reportIdIndex[patient][reportId] = patientReportIds[patient].length - 1;

        emit ReportRegistered(patient, reportId, reportHash, encryptedCid);

        // Prevent compiler warning about unused parameter
        (metadata);
    }

    /**
     * @notice Get a specific health report
     * @param patient Address of the patient
     * @param reportId ID of the report
     * @return report The health report
     */
    function getReport(
        address patient,
        bytes32 reportId
    ) external view returns (HealthReport memory report) {
        report = healthReports[patient][reportId];
        require(report.timestamp > 0, "Report not found");
    }

    /**
     * @notice Get all report IDs for a patient
     * @param patient Address of the patient
     * @return ids Array of report IDs
     */
    function getPatientReportIds(
        address patient
    ) external view returns (bytes32[] memory ids) {
        ids = patientReportIds[patient];
    }

    /**
     * @notice Get paginated report IDs for a patient
     * @param patient Address of the patient
     * @param offset Starting index
     * @param limit Maximum number of IDs to return
     * @return ids Array of report IDs
     */
    function getPatientReportIdsPaginated(
        address patient,
        uint256 offset,
        uint256 limit
    ) external view returns (bytes32[] memory ids) {
        bytes32[] storage allIds = patientReportIds[patient];
        uint256 total = allIds.length;

        if (offset >= total) {
            return new bytes32[](0);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }

        ids = new bytes32[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            ids[i - offset] = allIds[i];
        }
    }

    /**
     * @notice Get the count of reports for a patient
     * @param patient Address of the patient
     * @return count Number of reports
     */
    function getPatientReportCount(
        address patient
    ) external view returns (uint256 count) {
        count = patientReportIds[patient].length;
    }

    // ============ Access Logging ============

    /**
     * @notice Log a doctor's access to patient data (called by CRE workflow)
     * @param patient Address of the patient
     * @param doctor Address of the doctor
     * @param queryType Type of query made
     * @param reportId ID of the report accessed
     */
    function logAccess(
        address patient,
        address doctor,
        string calldata queryType,
        bytes32 reportId
    ) external onlyAuthorizedIssuer {
        uint256 index = accessLogIndex[patient];

        accessLogs[patient][index] = AccessLog({
            doctor: doctor,
            queryType: queryType,
            timestamp: block.timestamp,
            reportId: reportId
        });

        accessLogIndex[patient] = (index + 1) % 100;
        if (accessLogCount[patient] < 100) {
            accessLogCount[patient]++;
        }

        emit AccessLogRecorded(patient, doctor, queryType, block.timestamp);
    }

    /**
     * @notice Get access logs for a patient
     * @param patient Address of the patient
     * @return logs Array of access logs
     */
    function getAccessLogs(
        address patient
    ) external view returns (AccessLog[100] memory logs, uint256 count) {
        logs = accessLogs[patient];
        count = accessLogCount[patient];
    }

    // ============ Admin Functions ============

    /**
     * @notice Authorize a CRE workflow issuer
     * @param issuer Address to authorize
     */
    function authorizeIssuer(address issuer) external onlyOwner {
        require(issuer != address(0), "Invalid address");
        authorizedIssuers[issuer] = true;
        emit IssuerAuthorized(issuer);
    }

    /**
     * @notice Deauthorize a CRE workflow issuer
     * @param issuer Address to deauthorize
     */
    function deauthorizeIssuer(address issuer) external onlyOwner {
        require(issuer != address(0), "Invalid address");
        authorizedIssuers[issuer] = false;
        emit IssuerDeauthorized(issuer);
    }

    /**
     * @notice Transfer ownership of the contract
     * @param newOwner Address of the new owner
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }

    function supportsInterface(bytes4 interfaceId) public pure override returns (bool) {
        return
            interfaceId == type(IReceiver).interfaceId ||
            interfaceId == type(IERC165).interfaceId;
    }
}
