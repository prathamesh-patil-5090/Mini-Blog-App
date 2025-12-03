import { createSecretKey } from "crypto"
import type { Request } from "express"
import { decodeJwt, jwtVerify, SignJWT } from "jose"
import prisma from "../../db"
import env from "../../env"
import { JwtPayload } from "../types/JwtPayload"

// -----------------------------
// Utilities
// -----------------------------
const isExpired = (exp?: number): boolean => {
  return !exp || exp < Math.floor(Date.now() / 1000)
}

const getIp = (req: Request): string => {
  const xff = (req.headers["x-forwarded-for"] as string | undefined) || ""
  return (
    xff.split(",")[0]?.trim() ||
    (req.socket && (req.socket.remoteAddress as string)) ||
    "unknown"
  )
}

const blacklistToken = async (refreshToken: string) => {
  await prisma.blacklistedTokens.create({
    data: {
      refreshToken,
    },
  })
}

const logSuspiciousActivity = async ({
  userId,
  ip,
  token,
  reason,
}: {
  userId?: string
  ip: string
  token: string
  reason: string
}) => {
  await prisma.suspiciousActivity.create({
    data: {
      userId: userId || null,
      ip,
      token,
      reason,
    },
  })
}

// -----------------------------
// Token Family Management
// -----------------------------

/**
 * Creates a new token family for a user (used on login/register)
 */
export const createTokenFamily = async (userId: string): Promise<string> => {
  const tokenFamily = await prisma.tokenFamily.create({
    data: {
      userId,
      version: 1,
      isActive: true,
      lastUsed: new Date(),
    },
  })
  return tokenFamily.id
}

/**
 * Increments the version of a token family (used on refresh)
 */
const incrementTokenFamilyVersion = async (
  tokenFamilyId: string,
): Promise<number> => {
  const updated = await prisma.tokenFamily.update({
    where: { id: tokenFamilyId },
    data: {
      version: { increment: 1 },
      lastUsed: new Date(),
    },
  })
  return updated.version
}

/**
 * Invalidates all token families for a user (used on security breach detection)
 */
const invalidateAllUserTokenFamilies = async (
  userId: string,
): Promise<void> => {
  await prisma.tokenFamily.updateMany({
    where: { userId, isActive: true },
    data: { isActive: false },
  })
}

/**
 * Validates that a token family exists and is active
 */
const validateTokenFamily = async (
  tokenFamilyId: string,
  expectedVersion: number,
): Promise<boolean> => {
  const tokenFamily = await prisma.tokenFamily.findUnique({
    where: { id: tokenFamilyId },
  })

  if (!tokenFamily) {
    throw new Error("Token family not found")
  }

  if (!tokenFamily.isActive) {
    throw new Error("Token family has been invalidated")
  }

  // Check if the version matches - if not, token reuse is detected
  if (tokenFamily.version !== expectedVersion) {
    throw new Error("Token reuse detected - version mismatch")
  }

  return true
}

// -----------------------------
// Create tokens (login / signup)
// -----------------------------
export const createAccessToken = (payload: JwtPayload): Promise<string> => {
  const secret = env.JWT_SECRET
  const secretKey = createSecretKey(secret, "utf-8")
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(env.JWT_EXPIRES_IN || "15m")
    .sign(secretKey)
}

export const createRefreshToken = (payload: JwtPayload): Promise<string> => {
  const secret = env.JWT_REFRESH_SECRET
  const secretKey = createSecretKey(secret, "utf-8")
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey)
}

// -----------------------------
// Rotate access token (only when old access token is expired)
// -----------------------------
export const generateNewAccessToken = async (
  req: Request,
  oldAccessToken: string,
  payload: JwtPayload,
): Promise<string> => {
  const secret = env.JWT_SECRET
  const secretKey = createSecretKey(secret, "utf-8")

  if (!oldAccessToken) {
    throw new Error("Old accessToken is required for rotation")
  }

  const raw = oldAccessToken.startsWith("Bearer ")
    ? oldAccessToken.slice(7)
    : oldAccessToken

  const decoded = decodeJwt(raw)

  if (!isExpired(decoded.exp)) {
    throw new Error("Current access token is not expired — rotation blocked")
  }

  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(env.JWT_EXPIRES_IN || "15m")
    .sign(secretKey)
}

// -----------------------------
// Rotate refresh token with token family tracking
// -----------------------------
export const generateNewRefreshToken = async (
  payload: JwtPayload,
  oldRefreshToken: string,
): Promise<string> => {
  const secret = env.JWT_REFRESH_SECRET
  const secretKey = createSecretKey(secret, "utf-8")

  if (!oldRefreshToken) {
    throw new Error("Old refresh token is required for rotation")
  }

  const decodedToken = decodeJwt(oldRefreshToken)

  if (!isExpired(decodedToken.exp)) {
    throw new Error("Refresh token not expired — rotation blocked")
  }

  // Validate token family before creating new token
  await validateTokenFamily(payload.tokenFamilyId, payload.version)

  // Increment version for the new token
  const newVersion = await incrementTokenFamilyVersion(payload.tokenFamilyId)

  // Create new payload with incremented version
  const newPayload: JwtPayload = {
    ...payload,
    version: newVersion,
  }

  // Blacklist the old refresh token
  await blacklistToken(oldRefreshToken)

  return new SignJWT(newPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey)
}

// -----------------------------
// Verify access token
// -----------------------------
export const verifyAccessToken = async (
  accessToken: string,
): Promise<JwtPayload> => {
  const secret = env.JWT_SECRET
  const secretKey = createSecretKey(secret, "utf-8")
  const rawToken = accessToken.startsWith("Bearer ")
    ? accessToken.slice(7)
    : accessToken

  const { payload } = await jwtVerify(rawToken, secretKey)
  return {
    id: payload.id as string,
    name: payload.name as string,
    email: payload.email as string,
    username: payload.username as string,
    tokenFamilyId: payload.tokenFamilyId as string,
    version: payload.version as number,
  }
}

// -----------------------------
// Verify refresh token with reuse detection
// -----------------------------
export const verifyRefreshToken = async (
  refreshToken: string,
  req: Request,
): Promise<JwtPayload> => {
  const secret = env.JWT_REFRESH_SECRET
  const secretKey = createSecretKey(secret, "utf-8")

  const ip = getIp(req)

  // 1) Is the refresh token blacklisted? (CRITICAL: Token reuse detection)
  const blacklisted = await prisma.blacklistedTokens.findUnique({
    where: { refreshToken },
  })

  if (blacklisted) {
    // SECURITY ALERT: Blacklisted token reuse = compromised account
    // Decode to get user info (don't verify signature yet)
    try {
      const decoded = decodeJwt(refreshToken) as JwtPayload

      // Invalidate ALL tokens for this user
      await invalidateAllUserTokenFamilies(decoded.id)

      // Log the security breach
      await logSuspiciousActivity({
        userId: decoded.id,
        ip,
        token: refreshToken,
        reason:
          "CRITICAL: Blacklisted token reuse - all user tokens invalidated",
      })
    } catch (err) {
      // Even if decode fails, log the attempt
      await logSuspiciousActivity({
        userId: undefined,
        ip,
        token: refreshToken,
        reason: "Blacklisted token reuse attempt (malformed token)",
      })
    }

    throw new Error("Token reuse detected - account security breach")
  }

  // 2) Verify token signature using refresh secret
  let verified
  try {
    verified = await jwtVerify(refreshToken, secretKey)
  } catch (err) {
    throw new Error("Invalid refresh token")
  }

  const payload = verified.payload as JwtPayload

  // 3) Expired refresh token?
  if (isExpired(verified.payload.exp)) {
    await blacklistToken(refreshToken)
    throw new Error("Refresh token expired")
  }

  // 4) Validate token family and version
  try {
    await validateTokenFamily(payload.tokenFamilyId, payload.version)
  } catch (err) {
    // Token family validation failed - possible reuse attack
    await blacklistToken(refreshToken)

    // Invalidate all user tokens as a precaution
    await invalidateAllUserTokenFamilies(payload.id)

    await logSuspiciousActivity({
      userId: payload.id,
      ip,
      token: refreshToken,
      reason: `Token family validation failed: ${err instanceof Error ? err.message : "unknown"} - all tokens invalidated`,
    })

    throw new Error("Token validation failed - security breach detected")
  }

  // 5) Forced refresh attack detection
  const headerAuth = req.headers["authorization"]
  const cookieAccess = req.cookies?.accessToken
  const auth =
    (headerAuth as string | undefined) || (cookieAccess as string | undefined)

  if (auth) {
    try {
      const rawAccess = auth.startsWith("Bearer ") ? auth.slice(7) : auth
      const accessDecoded = decodeJwt(rawAccess)

      if (!isExpired(accessDecoded.exp)) {
        await blacklistToken(refreshToken)

        await logSuspiciousActivity({
          userId: payload.id,
          ip,
          token: refreshToken,
          reason: "Forced refresh while access token is still valid",
        })

        throw new Error(
          "Suspicious refresh: access token still valid (attack detected)",
        )
      }
    } catch (err) {
      // If it's our thrown error, rethrow it
      if (err instanceof Error && err.message.includes("Suspicious refresh")) {
        throw err
      }
      // Otherwise, malformed access token is not a blocker for refresh
      // Just log it for monitoring
      console.warn("Failed to verify access token during refresh check:", err)
    }
  }

  return {
    id: payload.id,
    name: payload.name,
    email: payload.email,
    username: payload.username,
    tokenFamilyId: payload.tokenFamilyId,
    version: payload.version,
  }
}

/**
 * Invalidates all active sessions for a user
 * Use this for logout all devices, password change, etc.
 */
export const invalidateAllUserSessions = async (
  userId: string,
): Promise<void> => {
  await invalidateAllUserTokenFamilies(userId)
}
