export function classifySyncError(
  error: unknown,
) {
  const details = error as {
    code?: string;
    status?: number;
    message?: string;
  };

  const code = details?.code || "";
  const status = details?.status || 0;

  const message =
    details?.message || String(error);

  const permanentCodes = [
    "42501",
    "23514",
    "23503",
    "22P02",
    "P0001",
    "PGRST202",
  ];

  const permanentStatuses = [
    400,
    401,
    403,
    404,
    422,
  ];

  const permanentMessage =
    /permission|policy|denied|forbidden|validation|invalid|inativo|sem permiss|not found|could not find the function/i;

  return (
    permanentCodes.includes(code) ||
    permanentStatuses.includes(status) ||
    permanentMessage.test(message)
  )
    ? "blocked"
    : "retry";
}

export const retryDelay = (
  attempt: number,
) =>
  Math.min(
    300000,
    2000 *
      2 ** Math.min(
        Math.max(0, attempt),
        8,
      ),
  );

export const isConfirmed = (
  result: unknown,
): result is {
  ok: true;
  revision: number;
} =>
  !!result &&
  typeof result === "object" &&
  (
    result as {
      ok?: boolean;
    }
  ).ok === true &&
  Number.isSafeInteger(
    (
      result as {
        revision?: number;
      }
    ).revision,
  ) &&
  (
    result as {
      revision: number;
    }
  ).revision > 0;
