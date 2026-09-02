export type ApiResponse<T = unknown> = {
  success: boolean;
  message: string | null;
  data: T | null;
  details: ApiErrorDetail[] | Record<string, unknown> | null;
};

export type ApiErrorDetail = {
  field?: string;
  message: string;
  [key: string]: unknown;
};

export const isApiResponse = (value: unknown): value is ApiResponse => {
  return typeof value === 'object' && value !== null && 'success' in value && 'message' in value && 'data' in value;
};
