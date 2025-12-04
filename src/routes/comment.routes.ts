import express from "express"
import {
  CreateComment,
  DeleteComment,
  GetCommentsForPost,
  UpdateComment,
} from "../controllers/comment.controller"
import { authenticateToken } from "../middlewares/authenticateToken"

const commentRouter = express.Router()


// Apply authentication to all comment routes
commentRouter.use(authenticateToken)

// Create a comment on a post
commentRouter.post("/:postId", CreateComment)

// Get all comments for a post
commentRouter.get("/:postId", GetCommentsForPost)

// Update a comment (by comment ID)
commentRouter.put("/:commentId", UpdateComment)

// Delete a comment (by comment ID)
commentRouter.delete("/:commentId", DeleteComment)

export default commentRouter