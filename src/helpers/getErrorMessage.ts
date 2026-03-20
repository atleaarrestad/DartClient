export function getErrorMessage(
	error: unknown,
	fallback = 'Something went wrong.',
): string {
	if (error instanceof Error && error.message.trim().length > 0)
		return error.message;

	if (typeof error === 'string' && error.trim().length > 0)
		return error;

	return fallback;
}
