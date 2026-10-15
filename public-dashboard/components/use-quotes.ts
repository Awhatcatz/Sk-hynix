"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Quote, Quotes } from "../lib/radar-types";
import { parseTicker } from "../lib/coinbase-ticker";
import { quoteIsStale } from "../lib/market-time";

export function useQuotes(auto: boolean) {
  const [quotes, setQuotes] = useState<Quotes | null>(null);
  const [live, setLive] = useState<Quote | null>(null);
  const [clock, setClock] = useState(Date.now());
  const busy = useRef(false);
  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const response = await fetch("/api/quotes", { cache: "no-store", signal: AbortSignal.timeout(35000) });
      if (response.ok) setQuotes(await response.json());
    } catch { /* Quotes retain their own age and cannot authorize signals. */ }
    finally { busy.current = false; }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 15000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!auto) return;
    let socket: WebSocket | undefined, retry: ReturnType<typeof setTimeout> | undefined, disposed = false;
    let lastMessage = Date.now();
    const connect = () => {
      if (disposed || document.hidden || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
      socket = new WebSocket("wss://ws-feed.exchange.coinbase.com");
      socket.onopen = () => { lastMessage = Date.now(); socket?.send(JSON.stringify({ type: "subscribe", product_ids: ["BTC-USD"], channels: ["ticker", "heartbeat"] })); };
      socket.onmessage = (event) => {
        try { const data = JSON.parse(event.data); lastMessage = Date.now(); const quote = parseTicker(data); if (quote) setLive(quote); } catch { /* Ignore malformed provider messages. */ }
      };
      socket.onclose = () => { if (!disposed && !document.hidden) retry = setTimeout(connect, 5000); };
      socket.onerror = () => socket?.close();
    };
    const visibility = () => {
      clearTimeout(retry);
      if (document.hidden) socket?.close();
      else { refresh(); if (!socket || socket.readyState === WebSocket.CLOSED) connect(); }
    };
    connect();
    document.addEventListener("visibilitychange", visibility);
    const timer = setInterval(() => {
      setClock(Date.now());
      if (!document.hidden) { refresh(); if (socket?.readyState === WebSocket.OPEN && Date.now() - lastMessage > 30000) socket.close(); }
    }, 10000);
    return () => { disposed = true; clearInterval(timer); clearTimeout(retry); document.removeEventListener("visibilitychange", visibility); socket?.close(); };
  }, [auto, refresh]);
  const quoteFor = (id: Quote["id"]) => {
    const poll = quotes?.quotes.find((item) => item.id === id);
    const item = id === "bitcoin" && live && auto && clock - Date.parse(live.quoteTime!) < 60000 ? live : poll;
    return item ? { ...item, stale: item.stale || !item.quoteTime || quoteIsStale(id, Date.parse(item.quoteTime) / 1000, new Date(clock)) } : undefined;
  };
  return { quoteFor, refresh, generatedAt: quotes?.generatedAt, providerStatus: quotes?.providerStatus };
}
