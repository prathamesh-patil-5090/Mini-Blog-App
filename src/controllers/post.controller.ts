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

const updateSchema = postSchema.partial()

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
        slug: user.username + "-" + trimmedSlug,
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
        slug: user.username + "-" + trimmedSlug,
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

/**
 * @openapi
 * /api/post/create:
 *   post:
 *     tags:
 *       - Post
 *     summary: Create a new post
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePostRequest'
 *           example:
 *             title: A Day in the Life of a Developer
 *             content: Today I learned how to wire Swagger examples into my API.
 *             slug: a-day-in-the-life-of-a-developer
 *             isPublished: true
 *             status: PUBLISHED
 *     responses:
 *       '201':
 *         description: Post created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 post:
 *                   $ref: '#/components/schemas/Post'
 */

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
      include: {
        likes: true,
        comments: true
      }
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

/**
 * @openapi
 * /api/post:
 *   get:
 *     tags:
 *       - Post
 *     summary: Get posts for authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: List of posts
 */

export const GetPostBySlug = async (
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
    const { postSlug } = req.params
    if (!postSlug) {
      return res.status(400).json({
        error: "Provide a valid Post Slug",
      })
    }
    
    const post = await prisma.post.findFirst({
      where: { slug: postSlug },
      include: {
        likes: true,
        comments: true
      }
    })

    return res.status(200).json({
      message: "Post Fetched successfully",
      post: post,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error"
    console.error("Error fetching post:", err)
    return res.status(500).json({ error: message })
  }
}

/**
 * @openapi
 * /api/post/slug/{postSlug}:
 *   get:
 *     tags:
 *       - Post
 *     summary: Get a post by slug
 *     parameters:
 *       - in: path
 *         name: postSlug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Post fetched
 */

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
    if (!postId) {
      return res.status(400).json({
        error: "Provide a valid Post id",
      })
    }
    const post = await prisma.post.findUnique({
      where: {
        id: postId,
      },
      include: {
        likes: true,
        comments: true
      }
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

/**
 * @openapi
 * /api/post/{postId}:
 *   get:
 *     tags:
 *       - Post
 *     summary: Get a post by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Post fetched
 */

export const UpdateById = async (
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
    if (!postId) {
      return res.status(400).json({
        error: "Provide a valid Post id",
      })
    }
    const existingPost = await prisma.post.findUnique({
      where: { id: postId },
    })

    if (!existingPost) {
      return res.status(400).json({
        error: "Post with this post id doesn't exist",
      })
    }
    const parsed = updateSchema.safeParse(req.body)
    if (parsed.error) {
      return res.status(400).json({
        message: "All fields are required",
        error: z.treeifyError(parsed.error),
      })
    }

    const { title, content, isPublished, status } = parsed.data
    let {slug} = parsed.data
    if (slug !== undefined) {
      const trimmedSlug = normalizeSlug(slug)
      const existingSlug = await prisma.post.findUnique({
        where: {
          slug: trimmedSlug,
        },
      })
      if (existingSlug) {
        return res.status(409).json({
          error: "This Slug is already in use",
        })
      }
    }
    if(!slug?.startsWith(`${user.username}-`)){      
      slug = user.username + "-" + slug
    }
    const updatedPost = await prisma.post.update({
      where: { id: postId },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(isPublished !== undefined && { isPublished }),
        ...(status !== undefined && { status }),
        ...(slug !== undefined && { slug }),
      },
    })

    return res.status(200).json({
      message: "Post updated successfully",
      post: updatedPost,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error"
    console.error("Error updating posts:", err)
    return res.status(500).json({ error: message })
  }
}

/**
 * @openapi
 * /api/post/{postId}:
 *   put:
 *     tags:
 *       - Post
 *     summary: Update a post by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdatePostRequest'
 *           example:
 *             title: Updated Post Title
 *             content: Updated content for the post.
 *             slug: updated-post-title
 *             isPublished: false
 *             status: DRAFT
 *     responses:
 *       '200':
 *         description: Post updated
 */

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
    if (!postId) {
      return res.status(400).json({
        error: "Provide a valid Post id",
      })
    }
    const existingPost = await prisma.post.findUnique({
      where: { id: postId },
    })

    if (!existingPost) {
      return res.status(400).json({
        error: "Post with this post id doesn't exist",
      })
    }

    await prisma.post.delete({
      where: {
        id: postId,
      },
    })
    return res.status(409).json({
      message: "Post deleted successfully"
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error"
    console.error("Error deleting posts:", err)
    return res.status(500).json({ error: message })
  }
}

/**
 * @openapi
 * /api/post/{postId}:
 *   delete:
 *     tags:
 *       - Post
 *     summary: Delete a post by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Post deleted
 */
