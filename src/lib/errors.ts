export function formatError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  if (error && typeof error === "object") {
    const value = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
      error_description?: unknown;
    };

    const parts = [value.message, value.details, value.hint, value.error_description]
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0);
    const code = typeof value.code === "string" ? ` (${value.code})` : "";

    if (parts.length) return `${parts.join(" ")}${code}`;
  }

  return "Unknown error";
}
