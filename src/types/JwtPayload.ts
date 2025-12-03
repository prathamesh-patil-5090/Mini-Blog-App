export interface JwtPayload {
  id: string
  name: string
  username: string
  email: string
  tokenFamilyId: string
  version: number
  [key: string]: unknown
}
