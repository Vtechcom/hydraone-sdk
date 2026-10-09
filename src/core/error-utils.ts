/** Extracts a message from any thrown value. */
export function errorMessage(err: unknown, fallback = ''): string {
  if (err instanceof Error) {
    return err.message || fallback;
  }
  if (typeof err === 'string') {
    return err || fallback;
  }
  if (err && typeof err === 'object' && typeof (err as { message?: unknown }).message === 'string') {
    return (err as { message: string }).message || fallback;
  }
  return fallback;
}

/** Extracts a string or numeric `code` property from any thrown value. */
export function errorCode(err: unknown): string | number | undefined {
  if (err && typeof err === 'object') {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string' || typeof code === 'number') {
      return code;
    }
  }
  return undefined;
}

/** Extracts the CIP-30 `info` string from a wallet error, if present. */
export function errorInfo(err: unknown): string | undefined {
  if (err && typeof err === 'object') {
    const info = (err as { info?: unknown }).info;
    if (typeof info === 'string') {
      return info;
    }
  }
  return undefined;
}

/** Extracts the `name` of a thrown value, if it has one. */
export function errorName(err: unknown): string | undefined {
  if (err && typeof err === 'object') {
    const name = (err as { name?: unknown }).name;
    if (typeof name === 'string') {
      return name;
    }
  }
  return undefined;
}
