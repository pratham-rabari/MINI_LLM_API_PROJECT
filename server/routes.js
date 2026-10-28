import express from "express";
import { callGeminiApi } from "./controllers/geminiApiController.js";
import {openAiApiCall} from "./controllers/chatGptApiController.js";
import { ollamaApiCall } from "./controllers/ollamaApiController.js";
import {openRouterApiCall} from "./controllers/openRouterController.js";
import {verifyToken} from "./middlewares/verifyToken.js";

const router = express.Router();

router.post("/callGeminiApi", verifyToken, callGeminiApi);
router.post("/callOpenAiApi", verifyToken, openAiApiCall);
router.post("/callOllamaApi", verifyToken, ollamaApiCall);
router.post("/callOpenRouterApi", verifyToken, openRouterApiCall);

export default router;