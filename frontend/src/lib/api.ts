const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export class ApiError extends Error {
  status: number;
  code?: string;
  data?: any;

  constructor(status: number, message: string, code?: string, data?: any) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = new Headers(options.headers || {});

  if (options.body && !headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errData: any = {};
    try {
      errData = await response.json();
    } catch {
      errData = { message: response.statusText };
    }
    throw new ApiError(response.status, errData.message || 'API request failed', errData.code || errData.error, errData);
  }

  // Handle 204 No Content or empty response bodies gracefully
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as unknown as T;
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  // Fallback: try to parse as JSON, return undefined if body is empty
  const text = await response.text();
  if (!text || text.trim().length === 0) {
    return undefined as unknown as T;
  }
  return JSON.parse(text);
}
