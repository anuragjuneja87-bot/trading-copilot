# WebSocket Real-Time Options Flow Setup

## Overview

The Options Flow page now supports **real-time updates via WebSocket** using Massive.com's WebSocket API for options aggregates. This provides true real-time data streaming instead of polling every 5 seconds.

## Architecture

### Hybrid Approach
- **WebSocket (Primary)**: Real-time streaming when available
- **REST API (Fallback)**: Polling when WebSocket is unavailable or disabled

### Components

1. **`src/lib/massive-websocket.ts`**: WebSocket client for Massive.com options aggregates
   - Supports per-second (`A`) and per-minute (`AM`) aggregates
   - Automatic reconnection
   - Subscription management

2. **`src/hooks/use-options-flow-websocket.ts`**: React hook for WebSocket integration
   - Manages subscriptions based on selected tickers
   - Merges WebSocket updates with REST data via React Query
   - Handles connection state

3. **`src/app/app/flow/page.tsx`**: Options Flow page
   - Integrated WebSocket hook
   - Shows connection status indicator
   - Reduces REST polling frequency when WebSocket is connected

## Configuration

### Environment Variables

Add to your `.env` file:

```bash
# Massive.com API Key for WebSocket
NEXT_PUBLIC_MASSIVE_API_KEY=your_massive_api_key_here

# Optional: Custom WebSocket URL (if different from default)
NEXT_PUBLIC_MASSIVE_WS_URL=wss://socket.massive.com
```

### WebSocket URL Format

The WebSocket client connects to:
- **Per-second aggregates**: `wss://socket.massive.com/options/A`
- **Per-minute aggregates**: `wss://socket.massive.com/options/AM` (default)

### Subscription Format

The client subscribes to option contracts using the format:
- Specific contract: `O:SPY240119C00450000` (O: + underlying + expiry + C/P + strike)
- Wildcard: `*` (all contracts - may require business plan)

## Usage

### Automatic Connection

The WebSocket connects automatically when:
1. Auto-refresh is enabled on the Options Flow page
2. At least one ticker is selected (or defaults to SPY, QQQ, NVDA)

### Connection Status

The UI shows:
- **Green pulsing dot + "Live"**: WebSocket connected
- **Gray dot + "Polling"**: Using REST API fallback

### Data Flow

1. **Initial Load**: REST API fetches historical data
2. **Real-time Updates**: WebSocket streams new aggregates
3. **Merging**: React Query merges WebSocket updates with existing data
4. **Fallback**: If WebSocket disconnects, REST polling resumes at normal interval

## API Documentation

- **Per-second aggregates**: https://massive.com/docs/websocket/options/aggregates-per-second
- **Per-minute aggregates**: https://massive.com/docs/websocket/options/aggregates-per-minute

## Notes

### Authentication

The WebSocket client currently sends the API key as a query parameter:
```
wss://socket.massive.com/options/AM?apiKey=YOUR_KEY
```

If Massive.com requires a different authentication method (e.g., auth message after connection), update the `connect()` method in `src/lib/massive-websocket.ts`.

### Subscription Messages

The client sends subscription messages in this format:
```json
{
  "action": "subscribe",
  "ticker": "O:SPY240119C00450000"
}
```

If Massive.com uses a different format, update the `subscribe()` method.

### Contract Ticker Format

Option contracts follow this format:
- `O:` = Options prefix
- `SPY` = Underlying ticker
- `240119` = Expiry (YYMMDD)
- `C` = Call/Put (C or P)
- `00450000` = Strike in cents (e.g., 450.00)

## Troubleshooting

### WebSocket Not Connecting

1. **Check API Key**: Verify `NEXT_PUBLIC_MASSIVE_API_KEY` is set correctly
2. **Check Console**: Look for `[Massive WS]` logs in browser console
3. **Check Network**: Verify WebSocket connection in browser DevTools → Network → WS
4. **Verify URL**: Ensure `NEXT_PUBLIC_MASSIVE_WS_URL` matches Massive.com's actual endpoint

### No Data Appearing

1. **Check Subscriptions**: Verify tickers are being subscribed (check console logs)
2. **Check Filters**: Ensure filters aren't too restrictive (e.g., minPremium = 0)
3. **Check Market Hours**: WebSocket may only stream during market hours
4. **Verify Contract Format**: Ensure option contract tickers are in correct format

### Fallback to REST

If WebSocket fails:
- Client automatically falls back to REST polling
- Connection status indicator shows "Polling"
- REST polling interval returns to normal (5s)

## Future Enhancements

- [ ] Support for per-second aggregates (`mode: 'A'`)
- [ ] Automatic contract discovery for selected underlying tickers
- [ ] WebSocket connection pooling for multiple pages
- [ ] Compression support for high-frequency data
- [ ] Replay/reconnection buffer for missed updates
