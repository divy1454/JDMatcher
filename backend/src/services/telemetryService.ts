import { EventEmitter } from 'events';

export interface TelemetryEvent {
  type: 'evaluation' | 'health_pulse';
  timestamp: string;
  data: {
    rawCostUsd?: number;
    billedCostUsd?: number;
    profitMarginUsd?: number;
    latencyMs?: number;
    totalTokens?: number;
    dbConnections?: number;
    uptimeSeconds?: number;
  };
}

class TelemetryEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }

  broadcastEvaluation(eventData: {
    rawCostUsd: number;
    billedCostUsd: number;
    profitMarginUsd: number;
    latencyMs: number;
    totalTokens: number;
  }) {
    const event: TelemetryEvent = {
      type: 'evaluation',
      timestamp: new Date().toISOString(),
      data: eventData,
    };
    this.emit('telemetry', event);
  }

  broadcastHealthPulse(dbConnections: number, uptimeSeconds: number) {
    const event: TelemetryEvent = {
      type: 'health_pulse',
      timestamp: new Date().toISOString(),
      data: {
        dbConnections,
        uptimeSeconds,
      },
    };
    this.emit('telemetry', event);
  }
}

export const telemetryService = new TelemetryEmitter();
