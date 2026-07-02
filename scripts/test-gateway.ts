import { generateText, Output } from 'ai';
import dotenv from 'dotenv';
import { z } from 'zod';

async function testModel(modelName: string) {
  console.log(`\nTesting model (Text): ${modelName}...`);
  try {
    const result = await generateText({
      model: modelName,
      prompt: 'Hello! Reply with exactly: SUCCESS',
    });
    console.log(`Text Result for ${modelName}:`, result.text);
  } catch (error: any) {
    console.error(`Error for ${modelName} (Text):`, error.message);
  }

  console.log(`Testing model (Structured via generateText + Output): ${modelName}...`);
  try {
    const result = await generateText({
      model: modelName,
      output: Output.object({
        schema: z.object({
          status: z.string().describe('Must be "SUCCESS"'),
          message: z.string().describe('A friendly message'),
        }),
      }),
      prompt: 'Generate the structured result with status SUCCESS',
    });
    console.log(`Structured Result for ${modelName}:`, JSON.stringify(result.output));
  } catch (error: any) {
    console.error(`Error for ${modelName} (Structured):`, error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

async function main() {
  // Load .env from the project directory
  dotenv.config();

  // Ensure global provider is loaded
  await import('../dist/config/models.js');

  const managerModel = process.env.ZILO_MANAGER_MODEL || 'minimax/minimax-m3';
  const helpModel = process.env.ZILO_HELP_MODEL || 'alibaba/qwen3.7-plus';
  const fallbackModel = 'google/gemini-2.5-flash';

  await testModel(managerModel);
  await testModel(helpModel);
  await testModel(fallbackModel);
}

main().catch(console.error);
