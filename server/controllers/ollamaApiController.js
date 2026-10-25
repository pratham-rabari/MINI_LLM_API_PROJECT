import { Ollama } from 'ollama'

const ollama = new Ollama({
    host: "https://ollama.com",
    headers: {
        Authorization: "Bearer " + process.env.OLLAMA_API_KEY,
    },
});

export const ollamaApiCall = async (req, res) => {
    try {
        const { prompt, modelName, systemPrompt, streamEnabled, temperature = 1.0, maxOutputTokens, context } = req.body;

        if (!prompt) {
            return res.status(400).json({ errorMsg: 'Prompt is required' });
        }

        if (!streamEnabled) {
            const response = await ollama.chat({
                model: modelName,
                messages: [
                    ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
                    ...(Array.isArray(context) && context.length > 0 ? context : []),
                    { role: "user", content: prompt },
                ],
                options: { temperature },
                stream: false
            })

            const tokenUsage = {
                inputTokens: response.prompt_eval_count,
                outputTokens: response.eval_count,
                totalTokens: response.prompt_eval_count + response.eval_count
            }
            return res.status(200).json({ status: 200, data: response.message.content, usage: tokenUsage, stream: streamEnabled })
        }

        const response = await ollama.chat({
            model: modelName,
            messages: [
                ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
                ...(Array.isArray(context) && context.length > 0 ? context : []),
                { role: "user", content: prompt },
            ],
            options: {
                temperature,
                num_predict: maxOutputTokens
            },
            stream: true
        })

        // const usage = {
        //     inputTokens: response.prompt_eval_count,
        //     outputTokens: response.eval_count,
        //     totalTokens:
        //         response.prompt_eval_count +
        //         response.eval_count
        // }

        // return res.status(200).json({ status: 200, data: response.message.content, usage: usage });
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        let usage = null;
        console.log("stream statred");
        for await (const chunk of response) {
            const content = chunk.message.content;

            if (content) {
                res.write(JSON.stringify({ type: "chunk", data: content }) + "\n");
            }

            if (chunk.done) {

                const TokenUsage = {
                    inputTokens: chunk.prompt_eval_count,
                    outputTokens: chunk.eval_count,
                    totalTokens: chunk.prompt_eval_count + chunk.eval_count
                }
                usage = TokenUsage;
                res.write(JSON.stringify({ type: "done", usage: usage }) + "\n");
            }
        }
        res.write(JSON.stringify({ status: 200, done: true }) + "\n");

        res.end();
    } catch (error) {
        console.error('Error calling Ollama API:', error);
        res.status(500).json({ errorMsg: 'Error calling Ollama API' });
    }
}

