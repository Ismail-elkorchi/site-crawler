export interface DeliveryGuarantees {
  readonly networkFetch: "at-least-once";
  readonly requestIdentity: "idempotent";
  readonly discoveryRecording: "idempotent";
  readonly terminalState: "idempotent";
  readonly evidenceObjects: "content-addressed";
  readonly activeLeaseOwnership: "single-owner";
}

export const DELIVERY_GUARANTEES: DeliveryGuarantees = {
  networkFetch: "at-least-once",
  requestIdentity: "idempotent",
  discoveryRecording: "idempotent",
  terminalState: "idempotent",
  evidenceObjects: "content-addressed",
  activeLeaseOwnership: "single-owner",
};
