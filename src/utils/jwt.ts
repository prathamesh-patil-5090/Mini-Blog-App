import { createSecretKey } from "crypto";
import type { Request } from "express";
import { decodeJwt, jwtVerify, SignJWT } from "jose";
import prisma from "../../db";
import env from "../../env";
import { JwtPayload } from "../types/JwtPayload";

// -----------------------------
// Utilities
// -----------------------------
const isExpired = (exp?: number): boolean => {
  return !exp || exp < Math.floor(Date.now() / 1000);
};

const getIp = (req: Request): string => {
  const xff = (req.headers["x-forwarded-for"] as string | undefined) || "";
  return (
    xff.split(",")[0]?.trim() ||
    (req.socket && (req.socket.remoteAddress as string)) ||
    "unknown"
  );
};

const blacklistToken = async (refreshToken: string) => {
  await prisma.blacklistedTokens.create({
    data: {
      refreshToken,
    },
  });
};

const logForceRefreshAttempt = async ({
  userId,
  ip,
  token,
}: {
  userId?: string;
  ip: string;
  token: string;
}) => {
  await prisma.suspiciousActivity.create({
    data: {
      userId: userId || null,
      ip,
      token,
      reason: "Forced refresh while access token is still valid",
    },
  });
};

// -----------------------------
// Create tokens (login / signup)
// -----------------------------
export const createAccessToken = (payload: JwtPayload): Promise<string> => {
  const secret = env.JWT_SECRET;
  const secretKey = createSecretKey(secret, "utf-8");
  return (
    new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      // default to a short-lived access token unless overridden
      .setExpirationTime(env.JWT_EXPIRES_IN || "15m")
      .sign(secretKey)
  );
};

export const createRefreshToken = (payload: JwtPayload): Promise<string> => {
  const secret = env.JWT_REFRESH_SECRET;
  const secretKey = createSecretKey(secret, "utf-8");
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey);
};

// -----------------------------
// Rotate access token (only when old access token is expired)
// -----------------------------
export const generateNewAccessToken = async (
  req: Request,
  oldAccessToken: string,
  payload: JwtPayload,
): Promise<string> => {
  const secret = env.JWT_SECRET;
  const secretKey = createSecretKey(secret, "utf-8");

  if (!oldAccessToken) {
    throw new Error("Old accessToken is required for rotation");
  }

  const raw = oldAccessToken.startsWith("Bearer ")
    ? oldAccessToken.slice(7)
    : oldAccessToken;

  const decoded = decodeJwt(raw);

  if (!isExpired(decoded.exp)) {
    throw new Error("Current access token is not expired — rotation blocked");
  }

  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(env.JWT_EXPIRES_IN || "15m")
    .sign(secretKey);
};

// -----------------------------
// Rotate refresh token (only when old refresh token is expired)
// -----------------------------
export const generateNewRefreshToken = async (
  payload: JwtPayload,
  oldRefreshToken: string,
): Promise<string> => {
  const secret = env.JWT_REFRESH_SECRET;
  const secretKey = createSecretKey(secret, "utf-8");

  if (!oldRefreshToken) {
    throw new Error("Old refresh token is required for rotation");
  }

  const decodedToken = decodeJwt(oldRefreshToken);

  if (!isExpired(decodedToken.exp)) {
    throw new Error("Refresh token not expired — rotation blocked");
  }

  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey);
};

// -----------------------------
// Verify access token
// -----------------------------
export const verifyAccessToken = async (
  accessToken: string,
): Promise<JwtPayload> => {
  const secret = env.JWT_SECRET;
  const secretKey = createSecretKey(secret, "utf-8");
  const rawToken = accessToken.startsWith("Bearer ")
    ? accessToken.slice(7)
    : accessToken;

  const { payload } = await jwtVerify(rawToken, secretKey);
  return {
    id: payload.id,
    name: payload.name,
    email: payload.email,
    username: payload.username,
  } as JwtPayload;
};

// -----------------------------
// Verify refresh token (main security logic)
// -----------------------------
export const verifyRefreshToken = async (
  refreshToken: string,
  req: Request,
): Promise<JwtPayload> => {
  const secret = env.JWT_REFRESH_SECRET;
  const secretKey = createSecretKey(secret, "utf-8");

  const ip = getIp(req);

  // 1) Is the refresh token blacklisted?
  const blacklisted = await prisma.blacklistedTokens.findUnique({
    where: { refreshToken },
  });
  if (blacklisted) {
    throw new Error("Refresh token blacklisted");
  }

  // 2) Verify token signature using refresh secret
  let verified;
  try {
    verified = await jwtVerify(refreshToken, secretKey);
  } catch (err) {
    throw new Error("Invalid refresh token");
  }

  const payload = verified.payload as JwtPayload;

  // 3) Expired refresh token?
  if (isExpired(verified.payload.exp)) {
    await blacklistToken(refreshToken);
    throw new Error("Refresh token expired");
  }

  // 4) Forced refresh attack detection:
  const headerAuth = req.headers["authorization"];
  const cookieAccess = req.cookies?.accessToken;
  const auth =
    (headerAuth as string | undefined) || (cookieAccess as string | undefined);

  if (auth) {
    try {
      const rawAccess = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
      const accessDecoded = decodeJwt(rawAccess);

      if (!isExpired(accessDecoded.exp)) {
        await blacklistToken(refreshToken);

        await logForceRefreshAttempt({
          userId: (payload?.id as string) || null,
          ip,
          token: refreshToken,
        });

        throw new Error(
          "Suspicious refresh: access token still valid (attack detected)",
        );
      }
    } catch {}
  }

  return {
    id: payload.id,
    name: payload.name,
    email: payload.email,
    username: payload.username,
  } as JwtPayload;
};
