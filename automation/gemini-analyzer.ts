import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from "fs";

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genai.getGenerativeModel({ model: "gemini-2.0-flash" });

export async function analyzeScreenshot(
  screenshotPath: string,
  url: string,
  consoleErrors: string[],
  flowName: string
): Promise<{ isBug: boolean; description: string; severity: "low" | "medium" | "high" }> {
  if (!fs.existsSync(screenshotPath)) {
    return { isBug: false, description: "No screenshot", severity: "low" };
  }

  const imageData = fs.readFileSync(screenshotPath).toString("base64");

  const prompt = `You are a QA engineer analyzing a screenshot of a live web app.

Current URL: ${url}
Current flow being tested: ${flowName}
Console errors captured: ${consoleErrors.length > 0 ? consoleErrors.join("\n") : "none"}

Look at the screenshot and answer:
1. Is there a visible bug, error, broken UI, missing content, or unexpected behavior?
2. Is the page loading correctly and showing the right content?
3. Are there any error messages, blank sections, broken layouts, or wrong states?

Respond ONLY in this exact JSON format:
{
  "isBug": true or false,
  "severity": "low" or "medium" or "high",
  "description": "short description of the bug or 'no issues found'"
}

Be strict: only report real bugs, not minor visual imperfections.`;

  const result = await model.generateContent([
    prompt,
    { inlineData: { mimeType: "image/png", data: imageData } },
  ]);

  try {
    const text = result.response.text().trim();
    const json = text.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(json);
  } catch {
    return { isBug: false, description: "Could not parse Gemini response", severity: "low" };
  }
}
