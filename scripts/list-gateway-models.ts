import { gateway } from 'ai';
import dotenv from 'dotenv';

async function main() {
  dotenv.config();

  // Load models config
  await import('../dist/config/models.js');

  console.log('Querying available models from Vercel AI Gateway...');
  try {
    const result = await gateway.getAvailableModels();
    console.log('Raw result type:', typeof result);
    console.log('Is array:', Array.isArray(result));
    console.log('Result keys:', Object.keys(result || {}));
    if (result && typeof result === 'object') {
      console.log('Result data/models summary:', JSON.stringify(result).substring(0, 1000));
    }

    const rawModels: any[] = Array.isArray(result) 
      ? result 
      : ((result as any).models || (result as any).data || []);
      
    console.log(`\nTotal models found: ${rawModels.length}`);
    
    const availableIds: string[] = rawModels
      .map((model: any) => typeof model === 'string' ? model : (model?.id || ''))
      .filter(Boolean);

    const geminiModels = availableIds.filter(id => id.includes('gemini'));
    console.log('\nGemini models found in gateway:');
    geminiModels.forEach(id => console.log(`- ${id}`));

    const minimaxModels = availableIds.filter(id => id.includes('minimax'));
    console.log('\nMinimax models found in gateway:');
    minimaxModels.forEach(id => console.log(`- ${id}`));

    const qwenModels = availableIds.filter(id => id.includes('qwen') || id.includes('alibaba'));
    console.log('\nQwen/Alibaba models found in gateway:');
    qwenModels.forEach(id => console.log(`- ${id}`));

    console.log('\nConfigured models checks:');
    const screenshotModel = process.env.ZILMATE_SCREENSHOT_MODEL || 'google/gemini-3.1-flash-lite';
    console.log(`Screenshot model: ${screenshotModel} - Available: ${availableIds.includes(screenshotModel)}`);

    const imageOpenaiModel = process.env.ZILO_IMAGE_OPENAI_MODEL || 'openai/gpt-image-2';
    console.log(`OpenAI Image model: ${imageOpenaiModel} - Available: ${availableIds.includes(imageOpenaiModel)}`);

    const imageGeminiModel = process.env.ZILO_IMAGE_GEMINI_MODEL || 'google/gemini-3-pro-image';
    console.log(`Gemini Image model: ${imageGeminiModel} - Available: ${availableIds.includes(imageGeminiModel)}`);

  } catch (error: any) {
    console.error('Error fetching models:', error.message);
    if (error.stack) console.error(error.stack);
  }
}

main().catch(console.error);
