import type { Response } from "express"
import z from "zod"
import prisma from "../../db"
import { AuthenticatedRequest } from "../types/AuthenticatedRequest"

enum Status {
  DRAFT = "DRAFT",
  PUBLISHED = "PUBLISHED",
  ARCHIVED = "ARCHIVED",
}
const postSchema = z.object({
  title: z.string().trim().min(5),
  content: z.string().trim(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug format"),
  isPublished: z.boolean().optional().default(false),
  status: z.enum(Status),
})

const normalizeSlug = (raw: string): string =>
  raw
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")

export const CreatePost = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<Response> => {
  try {
    const user = req.user
    if (!user) {
      return res.status(401).json({
        error: "Access denied: Token not provided or token is invalid",
      })
    }
    const parsed = postSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: z.treeifyError(parsed.error),
      })
    }

    const { title, content, slug, isPublished, status } = parsed.data
    const trimmedSlug = normalizeSlug(slug)
    const existingSlug = await prisma.post.findUnique({
      where: {
        slug: user.username + "/" + trimmedSlug,
      },
    })
    if (existingSlug) {
      return res.status(409).json({
        error: "This Slug is already in use",
      })
    }
    const post = await prisma.post.create({
      data: {
        authorId: user.id,
        title: title,
        content: content,
        slug: user.username + "/" + trimmedSlug,
        isPublished: isPublished,
        status: status,
      },
    })
    return res.status(201).json({
      message: "Post created successfully",
      post: post,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error"
    console.error("Error creating a post:", err)
    return res.status(500).json({ error: message })
  }
}

export const GetPosts = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<Response> => {
  try {
    const user = req.user
    if (!user) {
      return res.status(401).json({
        error: "Access denied: Token not provided or token is invalid",
      })
    }
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 10
    const skip = (page - 1) * limit
    const totalPosts = await prisma.post.count({
      where: { authorId: user.id },
    })

    const userPosts = await prisma.post.findMany({
      where: { authorId: user.id },
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    })
    const totalPages = Math.ceil(totalPosts / limit)
    return res.status(200).json({
      message: "Posts Fetched successfully",
      page,
      limit,
      totalPosts,
      totalPages,
      posts: userPosts,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error"
    console.error("Error fetching posts:", err)
    return res.status(500).json({ error: message })
  }
}

export const GetPostById = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<Response> => {
  try {
    const user = req.user
    if (!user) {
      return res.status(401).json({
        error: "Access denied: Token not provided or token is invalid",
      })
    }
    const { postId } = req.params
    if (postId) {
      return res.status(400).json({
        error: "Provide a valid Post id",
      })
    }
    const post = await prisma.post.findUnique({
      where: {
        id: postId,
      },
    })
    return res.status(200).json({
      message: "Post Fetched successfully",
      post,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error"
    console.error("Error fetching posts:", err)
    return res.status(500).json({ error: message })
  }
}

export const DeletePostById = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<Response> => {
  try {
    const user = req.user
    if (!user) {
      return res.status(401).json({
        error: "Access denied: Token not provided or token is invalid",
      })
    }
    const { postId } = req.params
    if (postId) {
      return res.status(400).json({
        error: "Provide a valid Post id",
      })
    }
    await prisma.post.delete({
      where: {
        id: postId,
      },
    })
    return res.status(409)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error"
    console.error("Error fetching posts:", err)
    return res.status(500).json({ error: message })
  }
}
