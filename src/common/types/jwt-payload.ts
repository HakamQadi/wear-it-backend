export type AccountRole = 'user' | 'admin';

export interface JwtPayload {
  sub: string;
  email: string;
  role: AccountRole;
}
