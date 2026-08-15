import ky from 'ky';
import type { Options } from 'ky';

interface ApiErrorPayload {
  code?: string;
  message?: string;
  field_errors?: Record<string, string | string[]>;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fieldErrors?: Record<string, string>;

  constructor({ code, message, status, fieldErrors }: {
    code: string;
    message: string;
    status: number;
    fieldErrors?: Record<string, string>;
  }) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

const client = ky.create({
  baseUrl: new URL('/api/', window.location.origin).toString(),
  credentials: 'include',
  throwHttpErrors: false,
  retry: 0,
});

export async function apiRequest<T>(path: string, options?: Options): Promise<T> {
  let response: Response;
  try {
    response = await client(path, options);
  } catch {
    throw new ApiError({
      code: 'network_error',
      message: 'Не удалось связаться с сервером. Проверьте подключение.',
      status: 0,
    });
  }
  if (!response.ok) {
    let payload: ApiErrorPayload = {};
    try {
      payload = await response.json() as ApiErrorPayload;
    } catch {
      // Keep a stable client error for invalid server responses.
    }
    const fieldErrors = payload.field_errors
      ? Object.fromEntries(Object.entries(payload.field_errors).map(([key, value]) => [
        key,
        Array.isArray(value) ? value[0] ?? 'Некорректное значение' : value,
      ]))
      : undefined;
    throw new ApiError({
      code: payload.code ?? 'request_failed',
      message: payload.message ?? 'Не удалось выполнить запрос',
      status: response.status,
      fieldErrors,
    });
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
