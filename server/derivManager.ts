import { DerivService } from './deriv.js';

class DerivConnectionManager {
  private connections = new Map<string, DerivService>();

  public getConnection(userId: string, token?: string): DerivService {
    if (!this.connections.has(userId)) {
      if (!token) {
        throw new Error("Cannot initialize Deriv connection without a token");
      }
      const service = new DerivService();
      // override token
      (service as any).apiToken = token;
      (service as any).realApiToken = token;
      (service as any).demoApiToken = token;
      this.connections.set(userId, service);
    }
    return this.connections.get(userId)!;
  }

  public removeConnection(userId: string) {
    if (this.connections.has(userId)) {
      const conn = this.connections.get(userId)!;
      // You'd need a disconnect method on DerivService if possible
      // conn.disconnect();
      this.connections.delete(userId);
    }
  }
}

export const derivManager = new DerivConnectionManager();
