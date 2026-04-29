import type { Response } from "express"
import z from "zod"
import prisma from "../../db"
import { AuthenticatedRequest } from "../types/AuthenticatedRequest"

const commentSchema = z.object({
  content: z.string().trim().min(1).max(1000), // Reasonable limits
})

export const CreateComment = async (
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
        error: "Provide a valid post ID",
      })
    }

    // Check if post exists
    const existingPost = await prisma.post.findUnique({
      where: { id: postId },
    })
    if (!existingPost) {
      return res.status(404).json({
        error: "Post not found",
      })
    }

    const parsed = commentSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: parsed.error.format(),
      })
    }

    const { content } = parsed.data

    const comment = await prisma.comment.create({
      data: {
        postId,
        authorId: user.id,
        content,
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        author: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
      },
    })

    return res.status(201).json({
      message: "Comment created successfully",
      comment,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error"
    console.error("Error creating comment:", err)
    return res.status(500).json({ error: message })
  }
}

/**
 * @openapi
 * /api/comment/{postId}:
 *   post:
 *     tags:
 *       - Comment
 *     summary: Create a comment on a post
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
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       '201':
 *         description: Comment created
 */

export const GetCommentsForPost = async (
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
        error: "Provide a valid post ID",
      })
    }

    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 10
    const skip = (page - 1) * limit

    const totalComments = await prisma.comment.count({
      where: { postId },
    })

    const comments = await prisma.comment.findMany({
      where: { postId },
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        author: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
      },
    })

    const totalPages = Math.ceil(totalComments / limit)

    return res.status(200).json({
      message: "Comments fetched successfully",
      page,
      limit,
      totalComments,
      totalPages,
      comments,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error"
    console.error("Error fetching comments:", err)
    return res.status(500).json({ error: message })
  }
}

/**
 * @openapi
 * /api/comment/{postId}:
 *   get:
 *     tags:
 *       - Comment
 *     summary: Get comments for a post
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
 *         description: Comments fetched
 */

export const UpdateComment = async (
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

    const { commentId } = req.params
    if (!commentId) {
      return res.status(400).json({
        error: "Provide a valid comment ID",
      })
    }

    // Check if comment exists and belongs to user
    const existingComment = await prisma.comment.findUnique({
      where: { id: commentId },
    })
    if (!existingComment) {
      return res.status(404).json({
        error: "Comment not found",
      })
    }
    if (existingComment.authorId !== user.id) {
      return res.status(403).json({
        error: "You can only update your own comments",
      })
    }

    const parsed = commentSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: parsed.error.format(),
      })
    }

    const { content } = parsed.data

    const updatedComment = await prisma.comment.update({
      where: { id: commentId },
      data: { content },
      select: {
        id: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        author: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
      },
    })

    return res.status(200).json({
      message: "Comment updated successfully",
      comment: updatedComment,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error"
    console.error("Error updating comment:", err)
    return res.status(500).json({ error: message })
  }
}

/**
 * @openapi
 * /api/comment/{commentId}:
 *   put:
 *     tags:
 *       - Comment
 *     summary: Update a comment
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       '200':
 *         description: Comment updated
 */

export const DeleteComment = async (
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

    const { commentId } = req.params
    if (!commentId) {
      return res.status(400).json({
        error: "Provide a valid comment ID",
      })
    }

    // Check if comment exists and belongs to user
    const existingComment = await prisma.comment.findUnique({
      where: { id: commentId },
    })
    if (!existingComment) {
      return res.status(404).json({
        error: "Comment not found",
      })
    }
    if (existingComment.authorId !== user.id) {
      return res.status(403).json({
        error: "You can only delete your own comments",
      })
    }

    await prisma.comment.delete({
      where: { id: commentId },
    })

    return res.status(200).json({
      message: "Comment deleted successfully",
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error"
    console.error("Error deleting comment:", err)
    return res.status(500).json({ error: message })
  }
}

/**
 * @openapi
 * /api/comment/{commentId}:
 *   delete:
 *     tags:
 *       - Comment
 *     summary: Delete a comment
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Comment deleted
 */
