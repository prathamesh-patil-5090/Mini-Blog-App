import dotenv from "dotenv"
import z from "zod"

process.env.APP_STAGE = process.env.APP_STAGE || "dev"

if (process.env.APP_STAGE === "dev") {
  dotenv.config()
} else if (process.env.APP_STAGE === "test") {
  dotenv.config({ path: ".env.test" })
} else if (process.env.APP_STAGE === "production") {
  dotenv.config({ path: ".env.production" })
}

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_STAGE: z.enum(["test", "dev", "production"]).default("dev"),
  PORT: z.coerce.number().positive().default(3000),
  DATABASE_URL: z.url("Invalid DATABASE_URL format"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be of 32 characters"),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, "JWT_REFRESH_SECRET must be of 32 characters"),
  JWT_EXPIRES_IN: z.string().default("10m"),
  BCRYPT_ROUNDS: z.coerce.number().positive().min(10).max(20).default(12),
})

export type Env = z.infer<typeof envSchema>
let env: Env
try {
  env = envSchema.parse(process.env)
} catch (e) {
  if (e instanceof z.ZodError) {
    console.error("Invalid environment variables:")
    console.error(JSON.stringify(z.flattenError(e), null, 2))
    e.issues.forEach((err) => {
      const path = err.path.join(".")
      console.error(`${path}: ${err.message}`)
    })
    process.exit(1)
  }
  throw e
}

export const isDev = env.APP_STAGE === "dev"
export const isProd = env.APP_STAGE === "production"
export const isTest = env.APP_STAGE === "test"

export { env }
export default env