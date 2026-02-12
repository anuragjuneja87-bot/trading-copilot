import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DATABRICKS_HOST = process.env.DATABRICKS_HOST;
const DATABRICKS_TOKEN = process.env.DATABRICKS_TOKEN;
const DATABRICKS_ENDPOINT = process.env.DATABRICKS_ENDPOINT || 'mas-7ab7b2ce-endpoint';

/**
 * Get today's date string in ET timezone
 */
function getTodayET(): string {
  const now = new Date();
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return etTime.toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * Generate morning briefing using AI
 */
async function generateBriefing(): Promise<string> {
  const prompt = `Give me a concise morning briefing for today's trading session. Include:
1. Overnight market moves and key news
2. Current market regime (CRISIS/ELEVATED/NORMAL)
3. Key levels to watch (SPY, QQQ, VIX)
4. Notable options flow or dark pool activity
5. Trading bias for the day

Keep it concise (3-4 bullet points) but actionable.`;

  const response = await fetch(
    `${DATABRICKS_HOST}/serving-endpoints/${DATABRICKS_ENDPOINT}/invocations`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DATABRICKS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
      signal: AbortSignal.timeout(180000), // 3 minutes
    }
  );

  if (!response.ok) {
    throw new Error(`Databricks API error: ${response.status}`);
  }

  const data = await response.json();
  
  // Extract text from Databricks response using the same logic as /api/ai/ask
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

  let text = '';
  
  // Format 0: Databricks output array format (new format)
  // Structure: { output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '...' }] }] }
  if (data && typeof data === 'object' && 'output' in data) {
    const output = (data as any).output;
    if (Array.isArray(output)) {
      const texts: string[] = [];
      // Find all messages with type 'message' and role 'assistant'
      for (const item of output) {
        if (item.type === 'message' && item.role === 'assistant') {
          if (Array.isArray(item.content)) {
            const extracted = extractFromContentArray(item.content);
            if (extracted) texts.push(extracted);
          } else if (typeof item.content === 'string' && item.content.trim()) {
            texts.push(item.content.trim());
          }
        }
      }
      if (texts.length > 0) {
        // Return all text messages joined together (for briefing, we want the full conversation)
        text = texts.join('\n\n').trim();
      }
    }
  }
  
  // Format 1: Array of message objects
  if (!text && Array.isArray(data)) {
    const texts: string[] = [];
    for (const item of data) {
      if (item.content && Array.isArray(item.content)) {
        const t = extractFromContentArray(item.content);
        if (t) texts.push(t);
      } else if (isTextPart(item)) {
        texts.push(item.text.trim());
      }
    }
    if (texts.length > 0) text = texts.join('\n\n');
  }

  // Format 2: Single object with content array
  if (!text && data && typeof data === 'object' && 'content' in data) {
    const content = (data as any).content;
    if (Array.isArray(content)) {
      text = extractFromContentArray(content);
    } else if (typeof content === 'string') {
      text = content;
    }
  }

  // Format 3: Direct text field
  if (!text && data && typeof data === 'object' && 'text' in data) {
    const textField = (data as any).text;
    if (textField && typeof textField === 'string' && textField.trim()) {
      text = textField.trim();
    }
  }

  // Format 4: Predictions array (legacy format)
  if (!text && data && typeof data === 'object' && 'predictions' in data) {
    const predictions = (data as any).predictions;
    if (Array.isArray(predictions) && predictions.length > 0) {
      const firstPred = predictions[0];
      text = firstPred.candidates?.[0]?.content?.parts?.[0]?.text || 
             firstPred.candidates?.[0]?.content || 
             firstPred.content ||
             (typeof firstPred === 'string' ? firstPred : '');
    }
  }

  // Format 5: Candidates array (legacy format)
  if (!text && data && typeof data === 'object' && 'candidates' in data) {
    const candidates = (data as any).candidates;
    if (Array.isArray(candidates) && candidates.length > 0) {
      text = candidates[0].content?.parts?.[0]?.text || 
             candidates[0].content ||
             '';
    }
  }

  // Format 6: Direct string response
  if (!text && typeof data === 'string' && data.trim()) {
    text = data;
  }

  // If we still don't have text, return a helpful error message
  if (!text || text.trim().length === 0) {
    console.warn('[Briefing API] Could not extract text from response. Structure:', Object.keys(data || {}));
    console.warn('[Briefing API] Response sample:', JSON.stringify(data).substring(0, 500));
    throw new Error('Failed to extract text from AI response. Response format may have changed.');
  }

  return text.trim();
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const date = dateParam || getTodayET();

    // Check if briefing exists in database for this date
    let existingBriefing = null;
    try {
      existingBriefing = await prisma.briefing.findFirst({
        where: {
          date: date,
          userId: session.user.id,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    } catch (dbError: any) {
      // If Briefing model doesn't exist yet, continue without DB check
      console.warn('[Briefing API] Database query failed (model may not exist yet):', dbError.message);
    }

    // If briefing exists and is from today, return it immediately
    if (existingBriefing && existingBriefing.content) {
      return NextResponse.json({
        success: true,
        data: {
          content: existingBriefing.content,
          date: existingBriefing.date,
          cached: true,
          createdAt: existingBriefing.createdAt.toISOString(),
        },
      });
    }

    // If no briefing exists, generate it
    // In production, this should be done via a cron job at 7 AM ET
    // For now, we'll generate on-demand but cache it
    try {
      const content = await generateBriefing();

      // Save to database (if model exists)
      try {
        if (existingBriefing) {
          await prisma.briefing.update({
            where: {
              id: existingBriefing.id,
            },
            data: {
              content: content,
              updatedAt: new Date(),
            },
          });
        } else {
          await prisma.briefing.create({
            data: {
              userId: session.user.id,
              date: date,
              content: content,
            },
          });
        }
      } catch (dbError: any) {
        // If Briefing model doesn't exist yet, just return the content without saving
        console.warn('[Briefing API] Database save failed (model may not exist yet):', dbError.message);
        // Continue to return the content even if DB save fails
      }

      return NextResponse.json({
        success: true,
        data: {
          content,
          date,
          cached: false,
          createdAt: new Date().toISOString(),
        },
      });
    } catch (genError: any) {
      console.error('[Briefing API] Generation error:', genError);
      // If generation fails but we have existing briefing, return that
      if (existingBriefing && existingBriefing.content) {
        return NextResponse.json({
          success: true,
          data: {
            content: existingBriefing.content,
            date: existingBriefing.date,
            cached: true,
            createdAt: existingBriefing.createdAt.toISOString(),
          },
        });
      }
      throw genError;
    }
  } catch (error: any) {
    console.error('[Briefing API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch briefing',
      },
      { status: 500 }
    );
  }
}
