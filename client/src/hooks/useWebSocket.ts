import { useEffect, useRef, useCallback, useState } from 'react';

type ReadyState = 'connecting' | 'open' | 'closing' | 'closed';

interface UseWebSocketReturn {
  send: (data: object) => void;
  messages: any[];
  clearMessages: () => void;
  readyState: ReadyState;
}

export function useWebSocket(url: string | null): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [readyState, setReadyState] = useState<ReadyState>('closed');
  const reconnectTimeoutRef = useRef<number>();
  const reconnectAttempts = useRef(0);

  const connect = useCallback(() => {
    if (!url) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setReadyState('open');
      reconnectAttempts.current = 0;
    };

    ws.onclose = () => {
      setReadyState('closed');
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
      reconnectAttempts.current++;
      reconnectTimeoutRef.current = window.setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[WS RECV]', data);
        setMessages(prev => [...prev, data]);
      } catch {
        console.error('Failed to parse message:', event.data);
      }
    };
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[WS SEND]', data);
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return { send, messages, clearMessages, readyState };
}
