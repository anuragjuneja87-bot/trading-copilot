import { NextRequest, NextResponse } from 'next/server';

// Databricks configuration
const DATABRICKS_HOST = process.env.DATABRICKS_HOST;
const DATABRICKS_TOKEN = process.env.DATABRICKS_TOKEN;
const DATABRICKS_ENDPOINT = process.env.DATABRICKS_ENDPOINT || 'mas-7ab7b2ce-endpoint';

export async function POST(request: NextRequest) {
  try {
    const { question, history } = await request.json();

    if (!question || typeof question !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Question is required' },
        { status: 400 }
      );
    }

    // Build conversation for the supervisor
    const messages = [];
    
    // Add history if provided
    if (history && Array.isArray(history)) {
      for (const msg of history.slice(-10)) {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }
    
    // Add current question
    messages.push({
      role: 'user',
      content: question,
    });

    // Call Databricks serving endpoint
    const response = await fetch(
      `${DATABRICKS_HOST}/serving-endpoints/${DATABRICKS_ENDPOINT}/invocations`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DATABRICKS_TOKEN}`,
        },
        body: JSON.stringify({
          input: messages, // Databricks agent endpoints use "input" not "messages"
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Databricks API error:', response.status, errorText);
      return NextResponse.json(
        { success: false, error: 'Failed to get AI response' },
        { status: 500 }
      );
    }

    const data = await response.json();
    
    // Extract text from Databricks agent response format
    // Format: [{ content: [{ type: "output_text", text: "..." }, ...], ... }]
    const message = extractTextFromResponse(data);

    return NextResponse.json({
      success: true,
      data: {
        message,
        timestamp: new Date().toISOString(),
      },
    });
    
  } catch (error) {
    console.error('AI API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function extractTextFromResponse(data: unknown): string {
  const TEXT_TYPES = ['text', 'output_text'];
  
  function isTextPart(p: any): boolean {
    return p && TEXT_TYPES.includes(p.type) && p.text && p.text.trim();
  }
  
  function extractFromContentArray(arr: any[]): string {
    return arr
      .filter(isTextPart)
      .map((p) => p.text.trim())
      .filter((t) => t.length > 0)
      .join('\n\n');
  }

  // Format 1: Array of message objects (Databricks agent format)
  if (Array.isArray(data)) {
    const texts: string[] = [];
    for (const item of data) {
      if (item.content && Array.isArray(item.content)) {
        const t = extractFromContentArray(item.content);
        if (t) texts.push(t);
      } else if (isTextPart(item)) {
        texts.push(item.text.trim());
      }
    }
    if (texts.length > 0) return texts.join('\n\n');
  }

  // Format 2: Single object with content array
  if (data && typeof data === 'object' && 'content' in data) {
    const content = (data as any).content;
    if (Array.isArray(content)) {
      const t = extractFromContentArray(content);
      if (t) return t;
    }
    if (typeof content === 'string') {
      return content;
    }
  }

  // Format 3: Direct text field
  if (data && typeof data === 'object' && 'text' in data) {
    return String((data as any).text);
  }

  // Format 4: Choices array (OpenAI-like)
  if (data && typeof data === 'object' && 'choices' in data) {
    const choices = (data as any).choices;
    if (Array.isArray(choices) && choices[0]?.message?.content) {
      return choices[0].message.content;
    }
  }

  // Fallback
  return typeof data === 'string' ? data : JSON.stringify(data);
}
