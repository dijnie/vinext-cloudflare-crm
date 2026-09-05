export interface AuthEmailMessage {
  to: string;
  url: string;
}

export interface AuthEmailAdapter {
  sendVerification(message: AuthEmailMessage): Promise<void>;
  sendPasswordReset(message: AuthEmailMessage): Promise<void>;
}
