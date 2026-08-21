import type { LiveDetectionCode, LiveDetectionResult } from '../services/detection';

export interface LiveActivity {
  workspaceId: string;
  requestId: string;
  code: LiveDetectionCode;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
}

export interface LiveWorkspaceSnapshot {
  activity: LiveActivity | null;
  /** @deprecated Server history is authoritative; retained only for old session payloads. */
  history?: LiveActivity[];
  result: LiveDetectionResult | null;
  savedAt: string;
}
