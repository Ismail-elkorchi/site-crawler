export function cancellationReason(signal: AbortSignal): string {
  if (signal.reason instanceof Error) return signal.reason.message;
  if (typeof signal.reason === "string") return signal.reason;
  if (isCancellationDetail(signal.reason)) return signal.reason.reason;
  return "Run cancellation requested";
}

function isCancellationDetail(
  value: unknown,
): value is { readonly kind: "cancelled"; readonly reason: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === "cancelled" &&
    "reason" in value &&
    typeof value.reason === "string"
  );
}
