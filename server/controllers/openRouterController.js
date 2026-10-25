import { OpenRouter } from '@openrouter/sdk';

const openRouter = new OpenRouter({
    apiKey: process.env.OPEN_ROUTER_API_KEY,
});

export const openRouterApiCall = async (req, res) => {
    try {
        const { prompt, modelName, systemPrompt, streamEnabled, temperature = 1.0, maxOutputTokens, context } = req.body;

        if (!prompt) {
            return res.status(400).json({ errorMsg: "Prompt is Required" })
        }

        console.log(modelName, "called");
        console.log(maxOutputTokens, "mx");

        if (!streamEnabled) {

            const stream = await openRouter.chat.send({
                chatRequest: {
                    model: modelName,
                    temperature,
                    maxCompletionTokens: maxOutputTokens,
                    messages: [
                        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
                        ...(Array.isArray(context) && context.length > 0 ? context : []),
                        { role: "user", content: prompt },
                    ],
                    stream: true,
                },
            });

            const tokenUsage = {
                inputTokens: response.usage.promptTokens,
                outputTokens: response.usage.completionTokens,
                totalTokens: response.usage.promptTokens + response.usage.completionTokens
            }

            console.log(response.usage, "uss");
            console.log(response.choices[0].finish_reason)
            return res.status(200).json({ status: 200, data: response.choices[0].message.content, usage: tokenUsage, stream: streamEnabled })
        }

        const stream = await openRouter.chat.send({
            chatRequest: {
                model: modelName,
                temperature,
                maxCompletionTokens: maxOutputTokens,
                messages: [
                    ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
                    ...(Array.isArray(context) && context.length > 0 ? context : []),
                    { role: "user", content: prompt },
                ],
                stream: true,
            },
        });

        console.log("started");

        // Tell client that we are sending a stream
        res.status(200);
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        console.log("stream started");
        let usage = null;
        for await (const chunk of stream) {

            const content = chunk.choices[0]?.delta?.content;

            if (content) {
                res.write(JSON.stringify({ type: "chunk", data: content }) + "\n");
            }

            if (chunk.usage) {
                const TokenUsage = {
                    inputTokens: chunk.usage.promptTokens,
                    outputTokens: chunk.usage.completionTokens,
                    totalTokens: chunk.usage.promptTokens + chunk.usage.completionTokens
                }
                usage = TokenUsage
                res.write(JSON.stringify({ type: "done", usage: usage }) + "\n");
            }
        }


        res.write(JSON.stringify({ status: 200, done: true }) + "\n");

        res.end();

    } catch (error) {
        console.error(error);

        if (!res.headersSent) {
            return res.status(500).json({ errorMsg: error.message })
        }

        res.end();
    }
};
// const completion = await openRouter.chat.send({
//     chatRequest: {
//         model: 'openai/gpt-5.2',
//         messages: [{ role: 'user', content: 'Say this is a test' }],
//         stream: false,
//     },
// });

// if (completion instanceof ReadableStream) {
//     throw new Error('Expected a non-streaming response');
// }

// console.log(completion.choices[0].message);
