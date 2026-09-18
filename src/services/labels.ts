/** Guest-facing instrument name. Keeps YARG enum values on the wire. */
export function instrumentLabel(instrument: string): string {
  return instrument
    .replace(/_(?:17|22)$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ");
}
