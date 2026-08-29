export enum AccountRole {
  USER = 'user',
  ADMIN = 'admin',
}

export const ACCOUNT_ROLES = Object.values(AccountRole);

export interface JwtPayload {
  sub: string;
  email: string;
  role: AccountRole;
}
