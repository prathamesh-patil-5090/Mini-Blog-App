import express from "express"
import {
  CreatePost,
  DeletePostById,
  GetPostById,
  GetPostBySlug,
  GetPosts,
  UpdateById,
} from "../controllers/post.controller"
import { authenticateToken } from "../middlewares/authenticateToken"

const postRouter = express.Router()

postRouter.use(authenticateToken)

postRouter.post("/create", CreatePost)
postRouter.get("/", GetPosts)
postRouter.get("/slug/:postSlug", GetPostBySlug)
postRouter.get("/:postId", GetPostById)
postRouter.put("/:postId", UpdateById)
postRouter.delete("/:postId", DeletePostById)

export default postRouter
