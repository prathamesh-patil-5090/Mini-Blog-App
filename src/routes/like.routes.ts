import express from "express"
import { LikePost, UnLikePost } from "../controllers/like.controller"
import { authenticateToken } from "../middlewares/authenticateToken"

const likeRouter = express.Router()

likeRouter.use(authenticateToken)

likeRouter.post("/:postId", LikePost)
likeRouter.delete("/:likeId", UnLikePost)

export default likeRouter
