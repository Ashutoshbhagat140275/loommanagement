const BASE_URL = import.meta.env.VITE_API_URL;

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    fields?: Record<string, string[] | undefined>;
  };
  // Better Auth's own endpoints use a flatter shape.
  message?: string;
  code?: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string[] | undefined> | undefined;

  constructor(
    status: number,
    code: string,
    message: string,
    fields?: Record<string, string[] | undefined>,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        // Only claim a JSON body when there is one. Fastify rejects a request
        // that says application/json but carries nothing, which is every
        // DELETE we send.
        ...(init?.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...init?.headers,
      },
    });
  } catch {
    // fetch only rejects when the request never got an answer.
    throw new ApiError(0, "OFFLINE", "Could not reach the server");
  }

  const text = await response.text();
  const body = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const parsed = (body ?? {}) as ApiErrorBody;
    throw new ApiError(
      response.status,
      parsed.error?.code ?? parsed.code ?? "ERROR",
      parsed.error?.message ?? parsed.message ?? "Something went wrong",
      parsed.error?.fields,
    );
  }

  return body as T;
}

export const apiPost = <T>(path: string, payload: unknown) =>
  apiFetch<T>(path, { method: "POST", body: JSON.stringify(payload) });
