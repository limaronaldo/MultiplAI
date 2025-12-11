import { GoogleGenAI } from "@google/genai";

export const generateDevPlan = async (
  apiKey: string,
  issueTitle: string,
  issueBody: string,
  repoContext: string
): Promise<string> => {
  if (!apiKey) {
    throw new Error("API Key is missing");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `
    You are AutoDev, an autonomous software development agent.
    
    Current Context:
    Repo: ${repoContext}
    
    Issue Title: ${issueTitle}
    Issue Body: ${issueBody}
    
    Task:
    Analyze the issue and propose a technical implementation plan.
    1. Identify key files to modify.
    2. Outline the logic changes required.
    3. Verify if the issue is well-scoped (Small/Medium complexity).
    
    Output Format:
    Return a concise markdown summary suitable for a Pull Request description. 
    Start with "## Implementation Plan".
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    return response.text || "No plan generated.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("Failed to generate plan from Gemini.");
  }
};