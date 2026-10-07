/** Message of a caught value, which TypeScript types as unknown. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
