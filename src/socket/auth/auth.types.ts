/** Payload stored in the access token at login. */
export interface AuthUser {
  id: string;
}

/** Extra data attached to each socket. */
export interface SocketAuthData {
  user?: AuthUser;
}
