import type { Response } from "express"
import prisma from "../../db"
import { AuthenticatedRequest } from "../types/AuthenticatedRequest"

export const LikePost = async (
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
    const likePost = await prisma.like.create({
      data: {
        authorId: user.id,
        postId,
      },
    })
    return res.status(201).json({
      message: "Successfully liked the post",
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error"
    console.error("Error liking posts:", err)
    return res.status(500).json({ error: message })
  }
}

/**
 * @openapi
 * /api/like/{postId}:
 *   post:
 *     tags:
 *       - Like
 *     summary: Like a post
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '201':
 *         description: Liked
 */

export const UnLikePost = async (
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
    const { likeId } = req.params
    if (!likeId) {
      return res.status(400).json({
        error: "Provide a valid like id",
      })
    }
    const existingPost = await prisma.like.findUnique({
      where: { id: likeId },
    })

    if (!existingPost) {
      return res.status(400).json({
        error: "Post with this post id doesn't exist",
      })
    }
    const UnlikePost = await prisma.like.delete({
      where: {
        id: likeId,
      },
    })
    return res.status(200).json({
      message: "Successfully unliked the post",
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error"
    console.error("Error unliking posts:", err)
    return res.status(500).json({ error: message })
  }
}

/**
 * @openapi
 * /api/like/{likeId}:
 *   delete:
 *     tags:
 *       - Like
 *     summary: Unlike (delete like)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: likeId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Unliked
 */
