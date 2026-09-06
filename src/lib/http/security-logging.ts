export interface SecurityEvent {
  code: string;
  requestId: string;
  method: string;
  outcome: "succeeded" | "rejected" | "failed";
}

export type SecurityLogger = (event: SecurityEvent) => void;

export const defaultSecurityLogger: SecurityLogger = (event) => {
  console.warn(JSON.stringify(event));
};
