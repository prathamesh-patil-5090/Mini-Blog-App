import type { Request, Response } from "express"
import z from "zod"
import prisma from "../../db"
import env from "../../env"
import { AuthenticatedRequest } from "../types/AuthenticatedRequest"
import { JwtPayload } from "../types/JwtPayload"
import {
  createAccessToken,
  createRefreshToken,
  createTokenFamily,
  generateNewRefreshToken,
  invalidateAllUserSessions,
  verifyRefreshToken,
} from "../utils/jwt"
import { comparePassword, hashPassword } from "../utils/password"

export const ACCESS_TOKEN_EXPIRY = 1 * 24 * 60 * 60 * 1000 // 1 day
export const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000 // 7 days

const registerSchema = z.object({
  name: z.string().min(3),
  username: z.string().min(3),
  email: z.email(),
  password: z.string().min(8),
})

const loginSchema = z
  .object({
    username: z.string().min(3).optional(),
    email: z.email().optional(),
    password: z.string().min(8),
  })
  .refine((data) => !!(data.username || data.email), {
    message: "Provide either username or email",
    path: ["username", "email"],
  })

// -----------------------------
// Cookie Helper
// -----------------------------
const setAuthCookies = (
  res: Response,
  accessToken: string,
  refreshToken: string,
) => {
  const cookieOptions = {
    httpOnly: true,
    secure: env.APP_STAGE === "production",
    sameSite: "strict" as const,
  }

  res.cookie("accessToken", accessToken, {
    ...cookieOptions,
    maxAge: ACCESS_TOKEN_EXPIRY,
  })

  res.cookie("refreshToken", refreshToken, {
    ...cookieOptions,
    maxAge: REFRESH_TOKEN_EXPIRY,
  })
}

const clearAuthCookies = (res: Response) => {
  res.clearCookie("accessToken")
  res.clearCookie("refreshToken")
}

// -----------------------------
// Register User
// -----------------------------
/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Register'
 *     responses:
 *       '201':
 *         description: User created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 accessToken:
 *                   type: string
 */
export const RegisterUser = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<Response> => {
  try {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: z.treeifyError(parsed.error),
      })
    }

    const { name, email, username, password } = parsed.data

    const existingUser = await prisma.author.findFirst({
      where: { OR: [{ username }, { email }] },
    })

    if (existingUser) {
      return res.status(409).json({
        error: "User with this email or username already exists",
      })
    }

    // Hash password (throws on validation error)
    const hashedPassword = await hashPassword(password)

    // Create new user
    const newUser = await prisma.author.create({
      data: {
        name,
        email,
        username,
        password: hashedPassword,
      },
    })

    if (!newUser.id) {
      throw new Error("Failed to create user")
    }


    // Create token payload
    const tokenPayload: JwtPayload = {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      username: newUser.username,
      tokenFamilyId,
      version: 1,
    }

    const accessToken = await createAccessToken(tokenPayload)
    const refreshToken = await createRefreshToken(tokenPayload)

    const { password: _, ...userWithoutPassword } = newUser

    setAuthCookies(res, accessToken, refreshToken)

    return res.status(201).json({
      message: "User created successfully",
      user: userWithoutPassword,
      accessToken,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error"
    console.error("Registration error:", err)
    return res.status(500).json({ error: message })
  }
}

// -----------------------------
// Login User
// -----------------------------
/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Login a user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Login'
 *     responses:
 *       '200':
 *         description: Logged in
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 accessToken:
 *                   type: string
 */
export const loginUser = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<Response> => {
  try {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: z.treeifyError(parsed.error),
      })
    }

    const { email, username, password } = parsed.data

    const existingUser = await prisma.author.findFirst({
      where: { OR: [{ username }, { email }] },
    })

    if (!existingUser) {
      return res.status(401).json({
        error: "Invalid credentials",
      })
    }

    const matchPassword = await comparePassword(password, existingUser.password)
    if (!matchPassword) {
      return res.status(401).json({
        error: "Invalid credentials",
      })
    }

    if (!existingUser.id) {
      throw new Error("User ID not found")
    }

    // Create new token family for this login session
    const tokenFamilyId = await createTokenFamily(existingUser.id)

    // Create token payload
    const tokenPayload: JwtPayload = {
      id: existingUser.id,
      name: existingUser.name,
      email: existingUser.email,
      username: existingUser.username,
      tokenFamilyId,
      version: 1,
    }

    const accessToken = await createAccessToken(tokenPayload)
    const refreshToken = await createRefreshToken(tokenPayload)

    const { password: _, ...userWithoutPassword } = existingUser

    setAuthCookies(res, accessToken, refreshToken)

    return res.status(200).json({
      message: "User logged in successfully",
      user: userWithoutPassword,
      accessToken,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error"
    console.error("Login error:", err)
    return res.status(500).json({ error: message })
  }
}

// -----------------------------
// Logout User
// -----------------------------
/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Logout a user (blacklist refresh token)
 *     responses:
 *       '200':
 *         description: Logged out
 */
export const logOut = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const refreshToken =
      req.cookies?.refreshToken ||
      req.header("Authorization")?.replace("Bearer ", "")

    if (!refreshToken) {
      return res.status(401).json({
        error: "Please provide refresh token",
      })
    }

    // Blacklist the refresh token
    await prisma.blacklistedTokens.create({
      data: {
        refreshToken,
      },
    })

    clearAuthCookies(res)

    return res.status(200).json({
      message: "User logged out successfully",
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error"
    console.error("Logout error:", err)
    return res.status(500).json({ error: message })
  }
}

// -----------------------------
// Logout All Devices
// -----------------------------
/**
 * @openapi
 * /api/auth/logoutAll:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Invalidate all sessions for current user
 *     responses:
 *       '200':
 *         description: Logged out from all devices
 */
export const logOutAllDevices = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<Response> => {
  try {
    const userId = req.user?.id

    if (!userId) {
      return res.status(401).json({
        error: "Unauthorized - user not found",
      })
    }

    // Invalidate all token families for this user
    await invalidateAllUserSessions(userId)

    clearAuthCookies(res)

    return res.status(200).json({
      message: "Logged out from all devices successfully",
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error"
    console.error("Logout all devices error:", err)
    return res.status(500).json({ error: message })
  }
}

// -----------------------------
// Refresh Token
// -----------------------------
/**
 * @openapi
 * /api/auth/refresh:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Refresh access token
 *     responses:
 *       '200':
 *         description: Tokens refreshed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TokenResponse'
 */
export const RefreshTokenController = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const refreshToken: string =
      req.cookies?.refreshToken ||
      req.header("Authorization")?.replace("Bearer ", "")

    if (!refreshToken) {
      return res.status(400).json({
        error: "Please provide refresh token",
      })
    }

    // Verify refresh token (includes token family validation and reuse detection)
    const user = await verifyRefreshToken(refreshToken, req)

    // Generate new refresh token (increments version)
    const newRefreshToken = await generateNewRefreshToken(user, refreshToken)

    // Create new access token with same payload
    const newAccessToken = await createAccessToken(user)

    setAuthCookies(res, newAccessToken, newRefreshToken)

    return res.status(200).json({
      message: "Tokens refreshed successfully",
      accessToken: newAccessToken,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid refresh token"
    console.error("Refresh token error:", err)

    // Check if this is a security breach
    if (
      message.includes("reuse") ||
      message.includes("invalidated") ||
      message.includes("security breach")
    ) {
      return res.status(403).json({
        error: "Security breach detected - please login again",
        details: message,
      })
    }

    return res.status(401).json({
      error: message,
    })
  }
}
