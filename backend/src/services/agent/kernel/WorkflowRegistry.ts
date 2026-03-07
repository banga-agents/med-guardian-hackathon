import type {
  RiskLevel,
  WorkflowDefinition,
  WorkflowRegistryFile,
} from './types';

export class WorkflowRegistry {
  private readonly file: WorkflowRegistryFile;
  private readonly byId: Map<string, WorkflowDefinition> = new Map();

  constructor(file: WorkflowRegistryFile) {
    this.file = file;
    for (const workflow of file.workflows) {
      this.byId.set(workflow.id, workflow);
    }
  }

  listWorkflows(): WorkflowDefinition[] {
    return this.file.workflows;
  }

  getWorkflow(id: string): WorkflowDefinition | undefined {
    return this.byId.get(id);
  }

  listByRisk(risk: RiskLevel): WorkflowDefinition[] {
    return this.file.workflows.filter((workflow) => workflow.riskLevel === risk);
  }

  count(): number {
    return this.file.workflows.length;
  }

  getVersion(): number {
    return this.file.version;
  }
}

