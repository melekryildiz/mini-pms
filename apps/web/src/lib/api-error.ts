/**
 * Backend'in farklı hata gövdelerini tek bir frontend hata tipinde toplar.
 * `status`, çağıran kodun 401, 403 veya 404 gibi durumları ayırt etmesini sağlar.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
