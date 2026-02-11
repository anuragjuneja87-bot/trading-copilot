# WebSocket Troubleshooting Guide

## Current Status

All WebSocket URL formats tested returned **404 Not Found**. This indicates:

1. **WebSocket endpoint URL is incorrect** - The endpoint might be different from what we tried
2. **WebSocket not included in plan** - Your API key might not have WebSocket access
3. **Different authentication required** - WebSocket might need a token instead of API key

## What We Tested

We tried these URL formats (all returned 404):

- `wss://socket.polygon.io/options/AM?apiKey=...`
- `wss://socket.polygon.io/options/AM`
- `wss://socket.massive.com/options/AM?apiKey=...`
- `wss://socket.massive.com/options/AM`
- `wss://socket.polygon.io/options?apiKey=...`
- `wss://socket.polygon.io?apiKey=...`

## Next Steps

### 1. Check Massive.com Documentation

You provided these docs:
- https://massive.com/docs/websocket/options/aggregates-per-second
- https://massive.com/docs/websocket/options/aggregates-per-minute

**Please check these docs for:**
- Exact WebSocket URL (base URL + path)
- Authentication method (API key in URL? Auth message? Token?)
- Subscription format
- Any setup/configuration steps

### 2. Check Your Dashboard

1. Log into your Massive.com/Polygon.io dashboard
2. Look for:
   - "WebSocket" or "Real-time" section
   - API documentation
   - Connection examples
   - WebSocket endpoint URL
3. Verify your plan includes WebSocket access

### 3. Contact Support

Ask Massive.com support:
- What is the exact WebSocket URL?
- Does my plan include WebSocket access?
- What authentication method should I use?
- Can you provide a working example?

### 4. Current Workaround

**REST API polling is working!** The app will:
- Use REST API every 5 seconds (configurable)
- Show "Polling" status instead of "Live"
- Work perfectly for real-time updates (5s delay is acceptable)

## Implementation Status

✅ **REST API**: Working perfectly
✅ **WebSocket Client**: Implemented and ready
⏸️ **WebSocket Connection**: Waiting for correct endpoint URL

Once you have the correct WebSocket URL, we can update:
- `src/lib/massive-websocket.ts` - Update `wsUrl` in constructor
- `.env` - Add `NEXT_PUBLIC_MASSIVE_WS_URL=correct_url_here`

## Testing

When you get the correct URL, test with:

```bash
node test-websocket.js
```

Or update the URL in `.env`:
```bash
NEXT_PUBLIC_MASSIVE_WS_URL=wss://correct-url-here
```

## Alternative: Use Polygon.io Directly

If Massive.com is a reseller of Polygon.io:
1. Check if you can use Polygon.io WebSocket directly
2. Use your Polygon API key (if same as Massive key)
3. Try: `wss://socket.polygon.io/options/AM`

But this also returned 404, so your API key might not have WebSocket access.

## Summary

**For now:** REST API polling works great (5s updates)
**Next:** Get correct WebSocket URL from Massive.com docs/support
**Then:** Update code with correct endpoint

The app is fully functional with REST polling - WebSocket is just an optimization for lower latency.
