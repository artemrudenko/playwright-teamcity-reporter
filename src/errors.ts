export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NotImplementedError);
    }

    this.name = 'NotImplementedError';
  }
}
