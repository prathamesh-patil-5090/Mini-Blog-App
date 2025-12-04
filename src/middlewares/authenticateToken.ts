import type { NextFunction, Response } from "express"
import { AuthenticatedRequest } from "../types/AuthenticatedRequest"
import { verifyAccessToken } from "../utils/jwt"

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const accessToken: string = req.cookies.accessToken
  if (!accessToken) {
    res.status(401).json({
      error: "Access Denied: Token was not provided",
    })
  }
  try {
    const user = await verifyAccessToken(accessToken)
    req.user = user
    next()
  } catch (err: unknown) {
    if (err instanceof Error) {
      res.status(401).json({
        error: "Access Denied: Invalid or expired token",
      })
    }
    return
  }
}
