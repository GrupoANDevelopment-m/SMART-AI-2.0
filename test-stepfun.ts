import OpenAI from 'openai';

async function test() {
  const client = new OpenAI({
    baseURL: "https://integrate.api.nvidia.com/v1",
    apiKey: "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"
  });
  try {
    const completion = await client.chat.completions.create({
      model: "stepfun-ai/step-3.5-flash",
      messages: [{ role: "user", content: "Hello" }],
      max_tokens: 10
    });
    console.log("Success:", JSON.stringify(completion, null, 2));
  } catch (e: any) {
    console.error("Error:", e.message);
  }
}
test();
