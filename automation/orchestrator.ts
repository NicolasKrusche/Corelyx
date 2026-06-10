import { execSync, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { analyzeScreenshot } from "./gemini-analyzer";

const MAX_RETRIES = 2;
const ARTIFACTS = "./automation/artifacts";
const PROMPT_PATH = "./automation/prompts/fix-bug.txt";

const FLOWS = ["login", "dashboard", "settings"];

function runFlow(flowName: string): boolean {
  const result = spawnSync(
    "pnpm",
    ["exec", "playwright", "test", "--grep", flowName, "--reporter=json"],
    { stdio: "pipe", encoding: "utf8" }
  );
  if (result.stdout) {
    fs.writeFileSync(path.join(ARTIFACTS, `${flowName}-run.json`), result.stdout);
  }
  return result.status === 0;
}

function writeBugReport(flowName: string, geminiResult: any, context: any) {
  const report = {
    timestamp: new Date().toISOString(),
    flow: flowName,
    url: context.url,
    error_type: "ai_detected_bug",
    error_message: geminiResult.description,
    severity: geminiResult.severity,
    console_errors: context.console_errors,
    screenshot_path: context.screenshot_path,
    reproduction_steps: [`Navigate to ${context.url}`, `Run the ${flowName} flow`],
    suspected_files: [],
  };
  fs.writeFileSync(path.join(ARTIFACTS, "bug-report.json"), JSON.stringify(report, null, 2));
  console.log(`Bug report written for: ${flowName}`);
}

function callClaudeCode(): boolean {
  const prompt = fs.readFileSync(PROMPT_PATH, "utf8");
  console.log("Calling Claude Code to fix bug...");
  const result = spawnSync("claude", ["-p", prompt, "--continue"], {
    stdio: "inherit",
    encoding: "utf8",
  });
  return result.status === 0;
}

function pushAndWait() {
  console.log("Pushing fix...");
  try {
    execSync('git add -A && git commit -m "fix: auto-repair" && git push', { stdio: "inherit" });
    console.log("Waiting 60s for Vercel redeploy...");
    // Cross-platform 60s wait
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60_000);
  } catch {
    console.log("Git push failed — push manually then rerun.");
    process.exit(1);
  }
}

async function main() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  console.log(`Starting debug loop -> ${process.env.BASE_URL}`);

  for (const flow of FLOWS) {
    console.log(`\nTesting flow: ${flow}`);
    let attempts = 0;

    while (attempts <= MAX_RETRIES) {
      // 1. Run Playwright to collect artifacts
      runFlow(flow);

      // 2. Read context artifact saved by Playwright
      const contextPath = path.join(ARTIFACTS, `${flow}-context.json`);
      if (!fs.existsSync(contextPath)) {
        console.log(`No context artifact for ${flow}, skipping.`);
        break;
      }

      const context = JSON.parse(fs.readFileSync(contextPath, "utf8"));
      const screenshotPath = path.join(ARTIFACTS, `${flow}.png`);

      // 3. Gemini analyzes screenshot
      console.log(`Gemini analyzing screenshot for: ${flow}`);
      const analysis = await analyzeScreenshot(
        screenshotPath,
        context.url,
        context.console_errors,
        flow
      );

      console.log(`  -> isBug: ${analysis.isBug} | ${analysis.description}`);

      if (!analysis.isBug) {
        console.log(`${flow}: no issues found.`);
        break;
      }

      if (attempts >= MAX_RETRIES) {
        console.log(`Max retries for ${flow}. Escalating to human.`);
        break;
      }

      // 4. Write bug report and call Claude Code
      writeBugReport(flow, analysis, context);
      const fixed = callClaudeCode();

      if (!fixed) {
        console.log("Claude Code failed. Check output.");
        break;
      }

      // 5. Push and wait for Vercel
      pushAndWait();
      attempts++;
    }
  }

  console.log("\nDebug loop complete.");
}

main().catch(console.error);
