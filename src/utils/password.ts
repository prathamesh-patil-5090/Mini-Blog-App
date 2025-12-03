import bcrypt from "bcrypt"
import env from "../../env"

export const hashPassword = async (password: string): Promise<string> => {
  const { isValid, errors } = validatePassword(password)
  if (!isValid) {
    throw new Error(errors.join("; "))
  }

  try {
    return await bcrypt.hash(password, env.BCRYPT_ROUNDS)
  } catch (err: unknown) {
    if (err instanceof Error) {
      throw err
    }
    throw new Error(String(err))
  }
}

export const comparePassword = async (
  password: string,
  hashedPassword: string,
): Promise<boolean> => {
  if (!password || typeof password !== "string") {
    throw new TypeError("Password must be a non-empty string")
  }

  if (!hashedPassword || typeof hashedPassword !== "string") {
    throw new TypeError("Hashed password must be a non-empty string")
  }
  return bcrypt.compare(password, hashedPassword)
}

export const validatePassword = (
  password: string,
): { isValid: boolean; errors: string[] } => {
  password = (password ?? "").trim()
  const errors: string[] = []
  if (password.length < 8) {
    errors.push("Password must be atleast 8 characters")
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain a Uppercase letter")
  }
  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain a number")
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain a Lowercase letter")
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push("Password must contain a special character")
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}
