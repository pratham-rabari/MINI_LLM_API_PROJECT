const model = {
    'gemini-3.5-flash-lite': '/callGeminiApi',
    'gemini-3.8-flash': '/callGeminiApi',
    'gemma4:31b': '/callOllamaApi',
    'deepseek-v4-flash-0731': '/callOpenRouterApi'
}

import { auth } from "../Firebase";

async function getAuthToken() {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("Please log in first");
  }

  return user.getIdToken();
}

const systemPromptsObj = {
  'Teacher': "You are a patient teacher. Explain concepts clearly and simply with examples, focusing on helping the user understand rather than just giving answers.",

  "Code reviewer": "You are an experienced code reviewer. Analyze the code for bugs, correctness, readability, edge cases, and time/space complexity, and suggest clear improvements.",

  'Interviewer': "You are a professional technical interviewer. Ask one question at a time, evaluate the user's answers, and gradually increase difficulty based on their performance.",

  "Coding assistant": "You are an expert coding assistant. Help the user write, debug, optimize, and understand clean, efficient, and maintainable code.",
   
  "none":''
};

// export const callApi = async (prompt, modelName) => {
//     try {
//         const endpoint = model[modelName];
//         console.log(endpoint);
//         const response = await api.post(endpoint, { prompt, modelName });
//         console.log(response);
//         return response.data || response.data.data.content;;
//     } catch (error) {
//         return { errorMsg: error.message };
//     }
// }

export const callApi = async (prompt, modelName, selectedSystemPrompt,streamEnabled, onChunk, onUsage, temperature = 1.0, maxOutputTokens, context) => {
    try {
        const token = await getAuthToken();
        console.log(maxOutputTokens,"mxx")
        const endpoint = model[modelName];
        const systemPrompt = systemPromptsObj[selectedSystemPrompt] || selectedSystemPrompt;
        console.log(systemPrompt,"sp");
        console.log(endpoint);
        const response = await fetch(
            `http://localhost:5000/api${endpoint}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    prompt,
                    modelName,
                    systemPrompt,
                    streamEnabled,
                    temperature,
                    maxOutputTokens,
                    context
                })
            }
        );

        if (!response.ok) {
            throw new Error("Failed to get response");
        }

        if (!response.body) {
            throw new Error("Response body is empty");
        }

        
        if(!streamEnabled){
            const result = await response.json();
            console.log(result,"d");
            onChunk(result.data);
            onUsage(result.usage);
            return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        console.log("stream started");

        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                console.log("stream finished");
                break;
            }

            buffer += decoder.decode(value, {
                stream: true
            });

            const lines = buffer.split("\n");

            // Keep incomplete data for the next chunk
            buffer = lines.pop();

            for (const line of lines) {

                if (!line.trim()) {
                    continue;
                }

                let data;
                try {
                    data = JSON.parse(line);
                } catch (error) {
                    console.error("JSON parse error:", error);
                    continue;
                }

                // AI text
                if (data.type === "chunk") {
                    console.log("AI chunk:", data.data);

                    onChunk?.(data.data);
                }

                // Token usage
                if (data.type === "done") {
                    console.log("Token usage:", data.usage);

                    onUsage?.(data.usage);
                }

                // Error
                if (data.type === "error") {
                    console.error("AI Error:", data.error);
                    throw new Error(data.error || "AI response failed");
                }

            }
        }



    } catch (error) {
        console.error("OpenRouter API Error:", error);
        throw error;
    }
};

// export const callOllamaApi = async (prompt) => {
//     try{
//          const response = await api.post('/callOllamaApi',{prompt});
//          return response.data;

//     } catch (error) {
//         return {errorMsg:error.message};
//     }
// }
