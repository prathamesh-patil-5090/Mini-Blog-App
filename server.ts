import cookieParser from "cookie-parser"
import express from "express"
import morgan from "morgan"
import cron from "node-cron"
import prisma from "./db"
import env from "./env"
import authRouter from "./src/routes/auth.routes"
import cleanupBlacklistedTokens from "./src/utils/cleanBlacklistedTokens"
const app = express()
const port = env.PORT

// PRE-WARM DB: connect before starting the HTTP server
;(async () => {
  try {
    console.log("Connecting to database...")
    await prisma.$connect()
    console.log("Database connected, starting server...")

    const server = app.listen(port, () => {
      console.log(
        `Server is running on https://localhost:${port} - [${env.APP_STAGE}]`,
      )
    })

    process.on("SIGTERM", async () => {
      console.log("SIGTERM received, shutting down gracefully...")
      server.close(async () => {
        await prisma.$disconnect()
        console.log("Server closed")
        process.exit(0)
      })
    })

    process.on("SIGINT", async () => {
      console.log("SIGINT received, shutting down gracefully...")
      server.close(async () => {
        await prisma.$disconnect()
        console.log("Server closed")
        process.exit(0)
      })
    })
  } catch (err) {
    console.error("Failed to connect to DB on startup:", err)
    process.exit(1)
  }
})()

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(morgan("dev"))

app.use("/api/auth", authRouter)

cron.schedule("0 2 * * *", async () => {
  console.log("Running scheduled cleanup of blacklisted tokens ...")
  await cleanupBlacklistedTokens()
})
