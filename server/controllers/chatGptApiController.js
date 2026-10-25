import OpenAI from "openai";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const openAiApiCall = async (req, res) => {
    try {
        const { prompt } = req.body;

        if (!prompt) {
            return re.status(400).json({ errorMsg: 'Prompt is Required' });
        }
        const response = await client.responses.create({
            model: "gpt-6-astra",
            input: prompt,
        });
       
        return res.status(200).json({status:200, data: response.output_text})
    } catch (error) {
        res.status(500).json({ errorMsg: error.message });
    }
}


