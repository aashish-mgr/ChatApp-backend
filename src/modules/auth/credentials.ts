import type { UserLoginRegister } from "./auth.types";

export const MIN_USERNAME_LENGTH = 3;
export const MAX_USERNAME_LENGTH = 32;
export const MIN_PASSWORD_LENGTH = 6;

/**
 * Returns an error message when the credentials are invalid, or null when they
 * are acceptable. Shared by register (strict) and login (presence only).
 */
export const validateCredentials = (
  userData: UserLoginRegister,
): string | null => {
  if (!userData?.username || !userData?.password) {
    return "Please provide username and password.";
  }
  if (
    userData.username.length < MIN_USERNAME_LENGTH ||
    userData.username.length > MAX_USERNAME_LENGTH
  ) {
    return `Username must be ${MIN_USERNAME_LENGTH}-${MAX_USERNAME_LENGTH} characters.`;
  }
  if (userData.password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
};
