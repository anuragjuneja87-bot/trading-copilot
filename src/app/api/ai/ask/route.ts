import { NextRequest, NextResponse } from 'next/server';

// Databricks configuration
const DATABRICKS_HOST = process.env.DATABRICKS_HOST;
const DATABRICKS_TOKEN = process.env.DATABRICKS_TOKEN;
const DATABRICKS_ENDPOINT = process.env.DATABRICKS_ENDPOINT || 'mas-7ab7b2ce-endpoint';

export async function POST(request: NextRequest) {
  try {
    // Validate Databricks configuration
    if (!DATABRICKS_HOST || DATABRICKS_HOST.includes('your-workspace')) {
      console.error('DATABRICKS_HOST is not configured or contains placeholder value');
      return NextResponse.json(
        { 
          success: false, 
          error: 'Databricks configuration is missing. Please set DATABRICKS_HOST in your .env file.' 
        },
        { status: 500 }
      );
    }

    if (!DATABRICKS_TOKEN || DATABRICKS_TOKEN.includes('your-personal-access-token')) {
      console.error('DATABRICKS_TOKEN is not configured or contains placeholder value');
      return NextResponse.json(
        { 
          success: false, 
          error: 'Databricks token is missing. Please set DATABRICKS_TOKEN in your .env file.' 
        },
        { status: 500 }
      );
    }

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

    // Prepare request body - try "input" format first (custom endpoints)
    // If that fails, we can try "messages" format (Foundation Model API)
    const requestBody = {
      input: messages, // Databricks custom endpoints typically use "input"
    };
    
    // Log request for debugging
    const startTime = Date.now();
    console.log('Calling Databricks endpoint:', `${DATABRICKS_HOST}/serving-endpoints/${DATABRICKS_ENDPOINT}/invocations`);
    console.log('Request body (first 500 chars):', JSON.stringify(requestBody, null, 2).substring(0, 500));
    console.log('Timeout set to:', parseInt(process.env.DATABRICKS_TIMEOUT || '180000') / 1000, 'seconds');
    
    // Call Databricks serving endpoint
    const response = await fetch(
      `${DATABRICKS_HOST}/serving-endpoints/${DATABRICKS_ENDPOINT}/invocations`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DATABRICKS_TOKEN}`,
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(parseInt(process.env.DATABRICKS_TIMEOUT || '300000')), // Default 5 minutes (agent does multiple iterations), configurable via env
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Databricks API error:', response.status, errorText);
      
      // Try to parse error message
      let errorMessage = 'Failed to get AI response from Databricks';
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorJson.message || errorText.substring(0, 200);
      } catch {
        errorMessage = errorText.substring(0, 200) || `HTTP ${response.status} error`;
      }
      
      return NextResponse.json(
        { 
          success: false, 
          error: errorMessage,
          status: response.status,
          details: process.env.NODE_ENV === 'development' ? errorText : undefined
        },
        { status: response.status >= 500 ? 500 : response.status }
      );
    }

    const data = await response.json();
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    // Log the response structure for debugging
    console.log(`Databricks response received in ${elapsedTime}s`);
    console.log('Databricks response structure:', JSON.stringify(data, null, 2).substring(0, 500));
    
    // Extract text from Databricks agent response format
    // Format: [{ content: [{ type: "output_text", text: "..." }, ...], ... }]
    const message = extractTextFromResponse(data);

    // Ensure we never return null or undefined
    if (!message || message === 'null' || message.trim() === '') {
      console.error('Failed to extract message from response:', data);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Unable to parse response from AI service. Please check the response format.',
          debug: process.env.NODE_ENV === 'development' ? { response: data } : undefined
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        message,
        timestamp: new Date().toISOString(),
      },
    });
    
  } catch (error: any) {
    console.error('AI API error:', error);
    
    // Provide more specific error messages
    if (error.name === 'AbortError' || error.code === 'UND_ERR_CONNECT_TIMEOUT' || error.code === 23) {
      const timeoutSeconds = parseInt(process.env.DATABRICKS_TIMEOUT || '300000') / 1000;
      return NextResponse.json(
        { 
          success: false, 
          error: `Request timed out after ${timeoutSeconds} seconds (${timeoutSeconds / 60} minutes). The AI agent is still processing your request through multiple analysis iterations. Please try again - complex queries can take 3-5 minutes to complete.` 
        },
        { status: 504 }
      );
    }
    
    if (error.code === 'ENOTFOUND' || error.message?.includes('getaddrinfo')) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Cannot connect to Databricks host: ${DATABRICKS_HOST}. Please verify your DATABRICKS_HOST is correct.` 
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
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
    if (!Array.isArray(arr)) return '';
    return arr
      .filter(isTextPart)
      .map((p) => p.text.trim())
      .filter((t) => t.length > 0)
      .join('\n\n');
  }

  // Format 0: Databricks output array format (most common)
  // Structure: { output: [{ type: 'message', role: 'assistant', content: [{ type: 'text', text: '...' }] }] }
  if (data && typeof data === 'object' && 'output' in data) {
    const output = (data as any).output;
    if (Array.isArray(output)) {
      const texts: string[] = [];
      // Find all messages with type 'message' and role 'assistant'
      for (const item of output) {
        if (item.type === 'message' && item.role === 'assistant') {
          if (Array.isArray(item.content)) {
            const text = extractFromContentArray(item.content);
            if (text) texts.push(text);
          } else if (typeof item.content === 'string' && item.content.trim()) {
            texts.push(item.content.trim());
          }
        }
      }
      if (texts.length > 0) {
        // Return the last message (usually the final response)
        return texts[texts.length - 1];
      }
    }
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

  // Format 3: Direct text field (check this early as it's common)
  if (data && typeof data === 'object' && 'text' in data) {
    const text = (data as any).text;
    if (text && typeof text === 'string' && text.trim()) {
      return text.trim();
    }
  }

  // Format 4: Choices array (OpenAI-like)
  if (data && typeof data === 'object' && 'choices' in data) {
    const choices = (data as any).choices;
    if (Array.isArray(choices) && choices[0]?.message?.content) {
      return choices[0].message.content;
    }
  }

  // Format 5: Direct string response
  if (typeof data === 'string' && data.trim()) {
    return data;
  }

  // Format 6: Check for predictions array (common ML model format)
  if (data && typeof data === 'object' && 'predictions' in data) {
    const predictions = (data as any).predictions;
    if (Array.isArray(predictions) && predictions.length > 0) {
      const firstPred = predictions[0];
      if (typeof firstPred === 'string') return firstPred;
      if (firstPred && typeof firstPred === 'object' && 'text' in firstPred) {
        return String(firstPred.text);
      }
    }
  }

  // Format 7: Check for output field
  if (data && typeof data === 'object' && 'output' in data) {
    const output = (data as any).output;
    if (typeof output === 'string') return output;
    if (Array.isArray(output) && output.length > 0) {
      return String(output[0]);
    }
  }

  // Last resort: return empty string (will trigger error handling)
  console.warn('Could not extract text from response, structure:', Object.keys(data || {}));
  return '';
}
