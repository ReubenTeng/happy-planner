export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}
export function required(name: string) {
  const value = process.env[name];
  if (!value)
    throw new AppError(
      503,
      "This service is not configured yet. Please try again after setup is complete.",
    );
  return value;
}
