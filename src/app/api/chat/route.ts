import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText } from 'ai';

export const runtime = 'nodejs';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { messages?: ChatMessage[] };
    const messages = body.messages ?? [];

    const modelName = process.env.GOOGLE_GEMINI_MODEL ?? 'gemini-2.5-flash';
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: 'Missing GOOGLE_GENERATIVE_AI_API_KEY' },
        { status: 500 },
      );
    }

    const google = createGoogleGenerativeAI({ apiKey });
    const result = streamText({
      model: google(modelName),
      messages,
    });

    return result.toDataStreamResponse({
      getErrorMessage: error => {
        if (error instanceof Error) return error.message;
        try {
          return JSON.stringify(error);
        } catch {
          return 'Unknown error';
        }
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}

