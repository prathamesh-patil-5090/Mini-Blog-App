import express from "express"
import {
  loginUser,
  logOut,
  logOutAllDevices,
  RefreshTokenController,
  RegisterUser,
} from "../controllers/auth.controller"

const authRouter = express.Router()

authRouter.post("/login", loginUser)
authRouter.post("/register", RegisterUser)
authRouter.post("/logout", logOut)
authRouter.post("/logoutAll", logOutAllDevices)
authRouter.post("/refresh", RefreshTokenController)

export default authRouter
