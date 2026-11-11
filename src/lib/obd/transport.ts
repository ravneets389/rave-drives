/** A byte pipe to an ELM327-compatible adapter (real BLE dongle or simulator). */
export interface Transport {
  readonly name: string;
  send(text: string): Promise<void>;
  onData(cb: (chunk: string) => void): void;
  onDisconnect(cb: () => void): void;
  close(): Promise<void>;
}
