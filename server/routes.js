import express from "express";
import { callGeminiApi } from "./controllers/geminiApiController.js";
import {openAiApiCall} from "./controllers/chatGptApiController.js";
import { ollamaApiCall } from "./controllers/ollamaApiController.js";
import {openRouterApiCall} from "./controllers/openRouterController.js";

const router = express.Router();

router.post("/callGeminiApi", callGeminiApi);
router.post("/callOpenAiApi", openAiApiCall);
router.post("/callOllamaApi", ollamaApiCall);
router.post("/callOpenRouterApi",openRouterApiCall)

export default router;