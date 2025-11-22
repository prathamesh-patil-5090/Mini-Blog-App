export interface JwtPayload {
  id: string;
  name: string;
  username: string;
  email: string;
  [key: string]: unknown;
}