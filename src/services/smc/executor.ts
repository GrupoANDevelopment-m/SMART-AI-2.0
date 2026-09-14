import { Position } from "./risk";

export enum ExecutionMode {
  SIMULATED = "SIMULATED",
  REAL = "REAL"
}

export class OrderExecutor {
  private mode: ExecutionMode;

  constructor(mode: ExecutionMode = ExecutionMode.SIMULATED) {
    this.mode = mode;
  }

  async execute(position: Position, asset: string) {
    console.log(`[${this.mode}] Executing ${asset} order:`, position);
    
    if (this.mode === ExecutionMode.SIMULATED) {
      // Return a simulated receipt
      return {
        id: `sim_${Math.random().toString(36).substr(2, 9)}`,
        status: "FILLED",
        ...position
      };
    }

    // Real execution would go here via API
    return null;
  }
}
