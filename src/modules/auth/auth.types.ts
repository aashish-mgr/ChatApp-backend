/** Payload stored in the access token at login. */
export interface AuthUser {
  id: string;
}

/** Extra data attached to each socket. */
export interface SocketAuthData {
  user?: AuthUser;
}

/** Payload sent by the client to register or log in. */
export interface UserLoginRegister {
  username: string;
  password: string;
}
