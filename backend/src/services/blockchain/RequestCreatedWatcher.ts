import { Contract, JsonRpcProvider } from 'ethers';
import { dispatchCRERequest } from '../../routes/cre';
import type { DoctorId, PatientId } from '../../types/simulation';

const requestContractAbi = [
  'event RequestCreated(bytes32 indexed requestId,string patientId,string doctorId,bytes32 commitId,string purpose,string[] categories,uint16 windowHours,uint256 createdAt,address indexed requester)',
];

const knownPatients = new Set<PatientId>(['sarah', 'robert', 'emma', 'michael']);
const knownDoctors = new Set<DoctorId>(['dr_chen', 'dr_rodriguez', 'dr_patel', 'dr_smith']);
const BLOCK_QUERY_OVERLAP = 2;

const isPatientId = (value: string): value is PatientId => knownPatients.has(value as PatientId);
const isDoctorId = (value: string): value is DoctorId => knownDoctors.has(value as DoctorId);

class RequestCreatedWatcher {
  private started = false;
  private provider: JsonRpcProvider | null = null;
  private contract: Contract | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private lastProcessedBlock: number | null = null;
  private polling = false;
  private readonly seenRequestIds = new Set<string>();

  start(): void {
    if (this.started) return;

    const rpcUrl = process.env.ETHEREUM_RPC_URL;
    const contractAddress =
      process.env.CRE_REQUEST_CONTRACT_ADDRESS
      || process.env.HEALTH_ACCESS_CONTROL_ADDRESS
      || process.env.HEALTH_ACCESS_CONTRACT
      || process.env.CRE_RECEIVER_ADDRESS;

    if (!rpcUrl || !contractAddress) {
      console.log('⚪ RequestCreated watcher disabled (missing ETHEREUM_RPC_URL or contract address)');
      return;
    }

    this.provider = new JsonRpcProvider(rpcUrl);
    this.contract = new Contract(contractAddress, requestContractAbi, this.provider);
    this.started = true;
    void this.bootstrapPolling(contractAddress);
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.contract = null;
    this.provider = null;
    this.lastProcessedBlock = null;
    this.polling = false;
    this.started = false;
    this.seenRequestIds.clear();
  }

  private async bootstrapPolling(contractAddress: string): Promise<void> {
    if (!this.provider) {
      return;
    }

    try {
      this.lastProcessedBlock = await this.provider.getBlockNumber();
      this.pollTimer = setInterval(() => {
        void this.pollForRequests();
      }, 4_000);
      console.log(`✅ RequestCreated watcher polling ${contractAddress} from block ${this.lastProcessedBlock}`);
    } catch (error: any) {
      console.error(
        `❌ Failed to initialize RequestCreated watcher: ${error?.message ?? 'unknown error'}`
      );
      this.stop();
    }
  }

  private async pollForRequests(): Promise<void> {
    if (!this.provider || !this.contract || this.lastProcessedBlock === null || this.polling) {
      return;
    }

    this.polling = true;
    try {
      const latestBlock = await this.provider.getBlockNumber();
      const fromBlock = Math.max(0, this.lastProcessedBlock - BLOCK_QUERY_OVERLAP);
      const logs = await this.contract.queryFilter(this.contract.filters.RequestCreated(), fromBlock, latestBlock);

      for (const log of logs) {
        const parsed = 'args' in log ? log : this.contract.interface.parseLog(log);
        if (!parsed) {
          continue;
        }

        const [requestId, patientIdRaw, doctorIdRaw, commitId, purposeRaw, categoriesRaw, windowHoursRaw] = parsed.args;
        await this.handleRequestEvent({
          requestId: String(requestId),
          patientIdRaw: String(patientIdRaw),
          doctorIdRaw: String(doctorIdRaw),
          commitId: String(commitId),
          purposeRaw: String(purposeRaw),
          categoriesRaw: Array.isArray(categoriesRaw) ? categoriesRaw.map((item) => String(item)) : [],
          windowHoursRaw: BigInt(windowHoursRaw),
        });
      }

      this.lastProcessedBlock = latestBlock;
    } catch (error: any) {
      console.error(
        `❌ RequestCreated watcher poll failed: ${error?.message ?? 'unknown error'}`
      );
    } finally {
      this.polling = false;
    }
  }

  private async handleRequestEvent(input: {
    requestId: string;
    patientIdRaw: string;
    doctorIdRaw: string;
    commitId: string;
    purposeRaw: string;
    categoriesRaw: string[];
    windowHoursRaw: bigint;
  }): Promise<void> {
    if (this.seenRequestIds.has(input.requestId)) {
      return;
    }

    if (!isPatientId(input.patientIdRaw) || !isDoctorId(input.doctorIdRaw)) {
      console.warn(
        `Ignoring RequestCreated ${input.requestId}: unknown patient/doctor (${input.patientIdRaw}, ${input.doctorIdRaw})`
      );
      return;
    }

    const windowHours = Number(input.windowHoursRaw);
    if (!Number.isInteger(windowHours) || windowHours < 1 || windowHours > 720) {
      console.warn(`Ignoring RequestCreated ${input.requestId}: invalid windowHours=${input.windowHoursRaw}`);
      return;
    }

    const purpose = input.purposeRaw.trim();
    if (purpose === 'audit_anchor') {
      this.seenRequestIds.add(input.requestId);
      console.log(`🧾 RequestCreated ${input.requestId} recorded for audit anchor`);
      return;
    }

    const categories = Array.isArray(input.categoriesRaw) && input.categoriesRaw.length > 0
      ? input.categoriesRaw.map((item) => String(item))
      : ['vitals', 'symptoms'];

    this.seenRequestIds.add(input.requestId);
    try {
      const dispatched = await dispatchCRERequest(
        {
          patientId: input.patientIdRaw,
          doctorId: input.doctorIdRaw,
          commitId: input.commitId as `0x${string}`,
          purpose,
          categories,
          windowHours,
        },
        {
          requestId: input.requestId,
        }
      );

      console.log(
        `✅ RequestCreated ${input.requestId} processed: receiptHash=${dispatched.receipt.receiptHash}`
      );
    } catch (error: any) {
      this.seenRequestIds.delete(input.requestId);
      console.error(
        `❌ Failed RequestCreated dispatch for ${input.requestId}: ${error?.message ?? 'unknown error'}`
      );
    }
  }
}

let watcher: RequestCreatedWatcher | null = null;

function getWatcher(): RequestCreatedWatcher {
  if (!watcher) {
    watcher = new RequestCreatedWatcher();
  }
  return watcher;
}

export function startRequestCreatedWatcher(): void {
  getWatcher().start();
}

export function stopRequestCreatedWatcher(): void {
  getWatcher().stop();
}
