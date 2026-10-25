import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });


export const callGeminiApi = async (req, res) => {
    try {
        const { prompt, modelName, systemPrompt, streamEnabled, temperature = 1.0, maxOutputTokens, context } = req.body;
        console.log(maxOutputTokens);
        if (!prompt) {
            return res.status(400).json({
                errorMsg: "Prompt is required"
            });
        }

        if (temperature > 1.0) {
            temperature = 1.0;
        }


        // const contextHistory =  Array.isArray(context) && context.length > 0 ? context : prompt;
        context.push({ role: "user", parts:[{ text: prompt}]});
        console.log("ch",context);

        if (!streamEnabled) {
            const response = await ai.models.generateContent({
                model: modelName,
                contents: context,
                system_instruction: systemPrompt || undefined,
                config: {
                    systemInstruction: systemPrompt || undefined,
                    temperature: temperature,
                    maxOutputTokens: maxOutputTokens
                }
            });

            const tokenUsage = {
                inputTokens: response.usageMetadata?.promptTokenCount || 0,
                outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
                totalTokens: response.usageMetadata?.totalTokenCount || 0
            };
            console.log("RS",response.text);

            return res.status(200).json({
                status: 200,
                data: response.text,
                usage: tokenUsage,
                stream: streamEnabled
            });
        }

        res.setHeader("Content-Type", "application/x-ndjson");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");


        const response = await ai.models.generateContentStream({
            model: modelName,
            contents: context,
            config: {
                systemInstruction: systemPrompt || undefined,
                temperature: temperature,
                maxOutputTokens: maxOutputTokens
            }
        });
        let usage = null;

        for await (const chunk of response) {
            if (chunk.text) {
                console.log("chunk",chunk.text);
                res.write(JSON.stringify({ type: "chunk", data: chunk.text }) + "\n");
            }

            if (chunk.usageMetadata) {
                usage = {
                    inputTokens: chunk.usageMetadata.promptTokenCount || 0,
                    outputTokens: chunk.usageMetadata.candidatesTokenCount || 0,
                    totalTokens: chunk.usageMetadata.totalTokenCount || 0
                };
            }
        }

        res.write(JSON.stringify({ type: "done", usage }) + "\n");
        res.end();

    } catch (error) {
        if (!res.headersSent) {
            return res.status(500).json({ success: false, message: "Something went wrong", error: error.message });
        }

        res.write(JSON.stringify({ type: "error", error: error.message }) + "\n");
        res.end();
    }
};



