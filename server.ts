import cookieParser from "cookie-parser"
import express from "express"
import morgan from "morgan"
import cron from "node-cron"
import swaggerUi from "swagger-ui-express"
import swaggerJsdoc from "swagger-jsdoc"
import prisma from "./db"
import env from "./env"
import authRouter from "./src/routes/auth.routes"
import commentRouter from "./src/routes/comment.routes"
import likeRouter from "./src/routes/like.routes"
import postRouter from "./src/routes/post.routes"
import cleanupBlacklistedTokens from "./src/utils/cleanBlacklistedTokens"
const app = express()
const port = env.PORT

// Swagger/OpenAPI setup
const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "Mini Blog API",
    version: "1.0.0",
    description: "API documentation for Mini Blog App",
  },
  servers: [
    {
      url: `http://localhost:${port}`,
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      User: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          username: { type: "string" },
          email: { type: "string" },
        },
      },
      Post: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          content: { type: "string" },
          slug: { type: "string" },
          isPublished: { type: "boolean" },
          status: { type: "string" },
          authorId: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
        example: {
          id: "post_123",
          title: "A Day in the Life of a Developer",
          content: "Today I learned how to wire Swagger examples into my API...",
          slug: "testuser1-a-day-in-the-life-of-a-developer",
          isPublished: true,
          status: "PUBLISHED",
          authorId: "author_123",
          createdAt: "2026-04-30T10:00:00.000Z",
          updatedAt: "2026-04-30T10:00:00.000Z",
        },
      },
      CreatePostRequest: {
        type: "object",
        required: ["title", "content", "slug", "status"],
        properties: {
          title: { type: "string", example: "A Day in the Life of a Developer" },
          content: {
            type: "string",
            example: "Today I learned how to wire Swagger examples into my API.",
          },
          slug: { type: "string", example: "a-day-in-the-life-of-a-developer" },
          isPublished: { type: "boolean", example: true },
          status: { type: "string", example: "PUBLISHED" },
        },
        example: {
          title: "A Day in the Life of a Developer",
          content: "Today I learned how to wire Swagger examples into my API.",
          slug: "a-day-in-the-life-of-a-developer",
          isPublished: true,
          status: "PUBLISHED",
        },
      },
      UpdatePostRequest: {
        type: "object",
        properties: {
          title: { type: "string", example: "Updated Post Title" },
          content: { type: "string", example: "Updated content for the post." },
          slug: { type: "string", example: "updated-post-title" },
          isPublished: { type: "boolean", example: false },
          status: { type: "string", example: "DRAFT" },
        },
        example: {
          title: "Updated Post Title",
          content: "Updated content for the post.",
          slug: "updated-post-title",
          isPublished: false,
          status: "DRAFT",
        },
      },
      Comment: {
        type: "object",
        properties: {
          id: { type: "string" },
          content: { type: "string" },
          author: { $ref: '#/components/schemas/User' },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Like: {
        type: "object",
        properties: {
          id: { type: "string" },
          authorId: { type: "string" },
          postId: { type: "string" },
        },
      },
      Register: {
        type: "object",
        required: ["name", "username", "email", "password"],
        properties: {
          name: { type: "string", example: "Test User" },
          username: { type: "string", example: "testuser1" },
          email: { type: "string", format: "email", example: "testuser1@mail.com" },
          password: { type: "string", example: "StrongPass!123" },
        },
        example: {
          name: "Test User",
          username: "testuser1",
          email: "testuser1@mail.com",
          password: "StrongPass!123"
        },
      },
      Login: {
        type: "object",
        properties: {
          username: { type: "string", example: "testuser1" },
          email: { type: "string", format: "email", example: "testuser1@mail.com" },
          password: { type: "string", example: "StrongPass!123" },
        },
        example: {
          username: "testuser1",
          email: "testuser1@mail.com",
          password: "StrongPass!123"
        },
      },
      TokenResponse: {
        type: "object",
        properties: {
          message: { type: "string" },
          accessToken: { type: "string" },
        },
      },
    },
  },
}

const swaggerOptions = {
  swaggerDefinition,
  apis: ["./src/controllers/*.ts", "./src/routes/*.ts"],
}

const swaggerSpec = swaggerJsdoc(swaggerOptions)

// PRE-WARM DB: connect before starting the HTTP server
;(async () => {
  try {
    console.log("Connecting to database...")
    await prisma.$connect()
    console.log("Database connected, starting server...")

    const server = app.listen(port, () => {
      console.log(
        `Server is running on http://localhost:${port} - [${env.APP_STAGE}]`,
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
app.use("/api/post", postRouter)
app.use("/api/like", likeRouter)
app.use("/api/comment", commentRouter)

// Serve API docs
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec))

cron.schedule("0 2 * * *", async () => {
  console.log("Running scheduled cleanup of blacklisted tokens ...")
  await cleanupBlacklistedTokens()
})
