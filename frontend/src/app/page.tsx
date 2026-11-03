"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  Send,
  Key,
  Copy,
  Plus,
  Trash2,
  ExternalLink,
  ShieldCheck,
  Layers,
  Radio,
  RotateCcw,
  Check,
  Zap,
} from "lucide-react";

interface DeliveryAttempt {
  id: string;
  subscription_id: string;
  attempt_number: number;
  status_code: number | null;
  status: string;
  execution_time_ms: number;
  error_message: string | null;
  created_at: string;
}

interface EventItem {
  id: string;
  event_type: string;
  idempotency_key: string;
  status: "PENDING" | "PROCESSING" | "DELIVERED" | "PARTIALLY_DELIVERED" | "DEAD_LETTER" | "NO_SUBSCRIBERS";
  created_at: string;
}

interface EventDetail extends EventItem {
  payload: Record<string, unknown>;
  delivery_attempts: DeliveryAttempt[];
}

interface Subscription {
  id: string;
  name: string;
  target_url: string;
  subscribed_events: string[];
  secret_key: string;
  is_active: boolean;
  created_at: string;
}

const DEFAULT_TEMPLATES = [
  {
    label: "Invoice Paid",
    type: "invoice.paid",
    payload: { invoice_id: "inv_90412", amount_usd: 1450.0, customer_id: "cus_x812b", currency: "USD" },
  },
  {
    label: "Payment Succeeded",
    type: "payment.succeeded",
    payload: { transaction_id: "txn_8829104", amount: 8900, status: "settled", payment_method: "card_visa" },
  },
  {
    label: "Order Created",
    type: "order.created",
    payload: { order_id: "ord_5521", items: [{ sku: "AI-SERVER-V1", qty: 2 }], total: 11000 },
  },
  {
    label: "Subscription Cancelled",
    type: "customer.subscription.deleted",
    payload: { sub_id: "sub_39102", reason: "churn_risk", canceled_at: new Date().toISOString() },
  },
];

export default function HookPulseStudio() {
  const [backendUrl, setBackendUrl] = useState("http://127.0.0.1:8000");
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<"stream" | "bench" | "subscriptions" | "dlq">("stream");

  const [events, setEvents] = useState<EventItem[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [eventDetail, setEventDetail] = useState<EventDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Bench form state
  const [selectedTemplate, setSelectedTemplate] = useState(DEFAULT_TEMPLATES[0].type);
  const [eventType, setEventType] = useState(DEFAULT_TEMPLATES[0].type);
  const [payloadStr, setPayloadStr] = useState(JSON.stringify(DEFAULT_TEMPLATES[0].payload, null, 2));
  const [idempotencyKey, setIdempotencyKey] = useState(`idem_${Math.random().toString(36).substring(2, 11)}`);
  const [dispatchStatus, setDispatchStatus] = useState<{ type: "success" | "error" | "conflict"; message: string } | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);

  // New Subscription Form State
  const [showSubModal, setShowSubModal] = useState(false);
  const [subName, setSubName] = useState("");
  const [subUrl, setSubUrl] = useState("https://httpbin.org/post");
  const [subPatterns, setSubPatterns] = useState("invoice.*, payment.*");
  const [creatingSub, setCreatingSub] = useState(false);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  // Check Backend Health
  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}/v1/health`);
      setIsConnected(res.ok);
    } catch {
      setIsConnected(false);
    }
  }, [backendUrl]);

  // Fetch Events
  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}/v1/events?limit=50`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
        setLastRefreshed(new Date());
      }
    } catch (e) {
      console.error("Failed to fetch events:", e);
    }
  }, [backendUrl]);

  // Fetch Subscriptions
  const fetchSubscriptions = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}/v1/subscriptions`);
      if (res.ok) {
        const data = await res.json();
        setSubscriptions(data);
      }
    } catch (e) {
      console.error("Failed to fetch subscriptions:", e);
    }
  }, [backendUrl]);

  // Initial Load and Auto-Refresh
  useEffect(() => {
    checkHealth();
    fetchEvents();
    fetchSubscriptions();

    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchEvents();
      fetchSubscriptions();
      checkHealth();
    }, 3000);

    return () => clearInterval(interval);
  }, [checkHealth, fetchEvents, fetchSubscriptions, autoRefresh]);

  // Fetch Event Detail
  const loadEventDetail = async (id: string) => {
    setSelectedEventId(id);
    setLoadingDetail(true);
    try {
      const res = await fetch(`${backendUrl}/v1/events/${id}`);
      if (res.ok) {
        const data = await res.json();
        setEventDetail(data);
      }
    } catch (e) {
      console.error("Failed to load event detail:", e);
    } finally {
      setLoadingDetail(false);
    }
  };

  // Dispatch Test Event
  const handleDispatch = async () => {
    setIsDispatching(true);
    setDispatchStatus(null);
    try {
      let parsedPayload: Record<string, unknown> = {};
      try {
        parsedPayload = JSON.parse(payloadStr);
      } catch {
        setDispatchStatus({ type: "error", message: "Invalid JSON format in payload." });
        setIsDispatching(false);
        return;
      }

      const res = await fetch(`${backendUrl}/v1/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          event_type: eventType,
          payload: parsedPayload,
          idempotency_key: idempotencyKey,
        }),
      });

      const body = await res.json();

      if (res.status === 202) {
        setDispatchStatus({
          type: "success",
          message: `Accepted (202). Event queued with ID ${body.id}.`,
        });
        fetchEvents();
        loadEventDetail(body.id);
      } else if (res.status === 409) {
        setDispatchStatus({
          type: "conflict",
          message: `Idempotency Conflict (409): ${body.detail}`,
        });
      } else {
        setDispatchStatus({
          type: "error",
          message: `HTTP ${res.status}: ${body.detail || "Error occurred."}`,
        });
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Network error";
      setDispatchStatus({ type: "error", message: `Network request failed: ${errorMessage}` });
    } finally {
      setIsDispatching(false);
    }
  };

  // Create Subscription
  const handleCreateSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subName || !subUrl) return;
    setCreatingSub(true);

    try {
      const patterns = subPatterns
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);

      const res = await fetch(`${backendUrl}/v1/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: subName,
          target_url: subUrl,
          subscribed_events: patterns.length > 0 ? patterns : ["*"],
        }),
      });

      if (res.ok) {
        setShowSubModal(false);
        setSubName("");
        setSubUrl("https://httpbin.org/post");
        setSubPatterns("invoice.*, payment.*");
        fetchSubscriptions();
      }
    } catch (err) {
      console.error("Failed to create subscription:", err);
    } finally {
      setCreatingSub(false);
    }
  };

  // Delete Subscription
  const handleDeleteSubscription = async (id: string) => {
    if (!confirm("Are you sure you want to delete this subscription?")) return;
    try {
      const res = await fetch(`${backendUrl}/v1/subscriptions/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchSubscriptions();
      }
    } catch (err) {
      console.error("Failed to delete subscription:", err);
    }
  };

  // Retry Event (DLQ)
  const handleRetryEvent = async (id: string) => {
    try {
      const res = await fetch(`${backendUrl}/v1/events/${id}/retry`, {
        method: "POST",
      });
      if (res.ok) {
        fetchEvents();
        loadEventDetail(id);
      }
    } catch (err) {
      console.error("Retry failed:", err);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Metrics
  const totalEvents = events.length;
  const deliveredCount = events.filter((e) => e.status === "DELIVERED").length;
  const dlqCount = events.filter((e) => e.status === "DEAD_LETTER").length;
  const successRate = totalEvents > 0 ? Math.round((deliveredCount / totalEvents) * 100) : 100;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <span className="p-2 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                <Zap className="w-5 h-5" />
              </span>
              <div>
                <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-indigo-400 via-sky-300 to-emerald-400 bg-clip-text text-transparent">
                  HookPulse Studio
                </span>
                <span className="ml-2 text-xs font-mono text-slate-400 border border-slate-800 rounded px-1.5 py-0.5">
                  v1.0.0
                </span>
              </div>
            </div>

            <nav className="hidden md:flex space-x-1 pl-6">
              {[
                { id: "stream", label: "Event Stream", icon: Radio },
                { id: "bench", label: "Test Bench", icon: Send },
                { id: "subscriptions", label: `Endpoints (${subscriptions.length})`, icon: Layers },
                { id: "dlq", label: `DLQ (${dlqCount})`, icon: AlertTriangle, badge: dlqCount > 0 },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                    className={`flex items-center space-x-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      isActive
                        ? "bg-slate-800 text-white border border-slate-700"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                    {tab.badge && (
                      <span className="ml-1 px-1.5 py-0.2 text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-full font-bold">
                        {dlqCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center space-x-3 text-xs">
            {/* Backend URL input */}
            <div className="hidden lg:flex items-center bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-400">
              <span className="text-[10px] uppercase font-mono mr-1.5 text-slate-500">API:</span>
              <input
                type="text"
                value={backendUrl}
                onChange={(e) => setBackendUrl(e.target.value)}
                className="bg-transparent font-mono text-[11px] text-slate-200 focus:outline-none w-44"
                placeholder="http://127.0.0.1:8000"
              />
            </div>

            {/* Backend connectivity indicator */}
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full border border-slate-800 bg-slate-900">
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected === true
                    ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
                    : isConnected === false
                    ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]"
                    : "bg-amber-400"
                }`}
              />
              <span className="font-mono text-slate-300">
                {isConnected === true ? "API Online" : isConnected === false ? "API Offline" : "Connecting..."}
              </span>
            </div>

            <button
              onClick={() => {
                fetchEvents();
                fetchSubscriptions();
                checkHealth();
              }}
              title={`Last refreshed at ${lastRefreshed.toLocaleTimeString()}`}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 border border-slate-800 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline font-mono text-[10px] text-slate-400">{lastRefreshed.toLocaleTimeString()}</span>
            </button>

            <a
              href={`${backendUrl}/docs`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center space-x-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md font-medium transition"
            >
              <span>Swagger Docs</span>
              <ExternalLink className="w-3.5 h-3.5 ml-1" />
            </a>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-1">
        {/* KPI Analytics Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Total Events</span>
              <Activity className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-white">{totalEvents}</div>
            <div className="mt-1 text-xs text-slate-500">Ingested through gateway</div>
          </div>

          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Delivery Success</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-emerald-400">{successRate}%</div>
            <div className="mt-1 text-xs text-slate-500">{deliveredCount} successful deliveries</div>
          </div>

          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Active Endpoints</span>
              <Layers className="w-4 h-4 text-sky-400" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-white">{subscriptions.length}</div>
            <div className="mt-1 text-xs text-slate-500">Listening to event topics</div>
          </div>

          <div
            className={`p-5 rounded-xl border transition ${
              dlqCount > 0
                ? "bg-rose-950/20 border-rose-800/50"
                : "bg-slate-900/60 border-slate-800"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Dead-Letter Queue</span>
              <AlertTriangle className={`w-4 h-4 ${dlqCount > 0 ? "text-rose-400" : "text-slate-500"}`} />
            </div>
            <div className={`mt-2 text-2xl font-bold font-mono ${dlqCount > 0 ? "text-rose-400" : "text-white"}`}>
              {dlqCount}
            </div>
            <div className="mt-1 text-xs text-slate-500">Exceeded max retry limits</div>
          </div>
        </div>

        {/* TAB 1: EVENT STREAM */}
        {activeTab === "stream" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Events List Table */}
            <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-white">Live Ingested Events</h3>
                  <p className="text-xs text-slate-400">Sub-millisecond idempotency locks with async worker dispatch</p>
                </div>
                <div className="flex items-center space-x-2 text-xs">
                  <label className="flex items-center space-x-1.5 cursor-pointer text-slate-400">
                    <input
                      type="checkbox"
                      checked={autoRefresh}
                      onChange={(e) => setAutoRefresh(e.target.checked)}
                      className="rounded bg-slate-800 border-slate-700 text-indigo-500 focus:ring-0"
                    />
                    <span>Poll 3s</span>
                  </label>
                </div>
              </div>

              {events.length === 0 ? (
                <div className="py-16 text-center text-slate-500 text-sm">
                  <Radio className="w-8 h-8 mx-auto mb-3 opacity-40" />
                  No events ingested yet. Fire a test event from the{" "}
                  <button
                    onClick={() => setActiveTab("bench")}
                    className="text-indigo-400 hover:underline font-medium"
                  >
                    Test Bench
                  </button>
                  .
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[550px] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/70 text-slate-400 uppercase tracking-wider text-[10px] sticky top-0">
                      <tr>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Event Type</th>
                        <th className="py-3 px-4">Idempotency Key</th>
                        <th className="py-3 px-4 text-right">Age</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {events.map((evt) => {
                        const isSelected = selectedEventId === evt.id;
                        return (
                          <tr
                            key={evt.id}
                            onClick={() => loadEventDetail(evt.id)}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? "bg-indigo-950/40 border-l-2 border-indigo-400"
                                : "hover:bg-slate-800/40"
                            }`}
                          >
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                                  evt.status === "DELIVERED"
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                    : evt.status === "DEAD_LETTER"
                                    ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                                    : evt.status === "NO_SUBSCRIBERS"
                                    ? "bg-slate-800 text-slate-400 border border-slate-700"
                                    : "bg-amber-500/10 text-amber-300 border border-amber-500/30"
                                }`}
                              >
                                {evt.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-semibold text-slate-200">{evt.event_type}</td>
                            <td className="py-3 px-4 text-slate-400 truncate max-w-[160px]">{evt.idempotency_key}</td>
                            <td className="py-3 px-4 text-right text-slate-500 whitespace-nowrap">
                              {new Date(evt.created_at).toLocaleTimeString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Event Inspector Drawer */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 flex flex-col h-[610px]">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-400" />
                  <h3 className="font-semibold text-white text-sm">Delivery Audit Inspector</h3>
                </div>
                {eventDetail && (
                  <button
                    onClick={() => loadEventDetail(eventDetail.id)}
                    className="text-slate-400 hover:text-white p-1 rounded"
                    title="Reload event audit"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {!selectedEventId ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-500 text-xs">
                  <Clock className="w-8 h-8 opacity-40 mb-2" />
                  Select an event from the stream to view payload JSON and delivery retry trails.
                </div>
              ) : loadingDetail ? (
                <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading audit history...
                </div>
              ) : eventDetail ? (
                <div className="flex-1 overflow-y-auto pt-3 space-y-4 text-xs font-mono">
                  {/* Metadata */}
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Event ID:</span>
                      <span className="text-slate-300 select-all">{eventDetail.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Idempotency Key:</span>
                      <span className="text-slate-300 truncate max-w-[180px]">{eventDetail.idempotency_key}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Event Topic:</span>
                      <span className="text-indigo-300 font-bold">{eventDetail.event_type}</span>
                    </div>
                  </div>

                  {/* JSON Payload preview */}
                  <div>
                    <span className="text-[11px] font-sans font-semibold text-slate-400 block mb-1">
                      Payload (HMAC-SHA256 Signed):
                    </span>
                    <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-[11px] text-emerald-300 overflow-x-auto max-h-36">
                      {JSON.stringify(eventDetail.payload, null, 2)}
                    </pre>
                  </div>

                  {/* Delivery Attempts List */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-sans font-semibold text-slate-400">
                        Delivery Timeline ({eventDetail.delivery_attempts?.length || 0} attempts):
                      </span>
                      {eventDetail.status === "DEAD_LETTER" && (
                        <button
                          onClick={() => handleRetryEvent(eventDetail.id)}
                          className="flex items-center space-x-1 px-2 py-0.5 bg-rose-600/30 hover:bg-rose-600 text-rose-200 border border-rose-500/40 rounded text-[10px] transition"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Re-queue DLQ</span>
                        </button>
                      )}
                    </div>

                    {(!eventDetail.delivery_attempts || eventDetail.delivery_attempts.length === 0) ? (
                      <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-slate-500 text-center">
                        {eventDetail.status === "NO_SUBSCRIBERS"
                          ? "No active subscriptions matched this topic pattern."
                          : "Dispatched to background queue..."}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {eventDetail.delivery_attempts.map((att) => (
                          <div
                            key={att.id}
                            className={`p-2.5 rounded-lg border ${
                              att.status === "SUCCESS"
                                ? "bg-emerald-950/20 border-emerald-800/40"
                                : att.status === "DEAD_LETTER"
                                ? "bg-rose-950/20 border-rose-800/40"
                                : "bg-amber-950/20 border-amber-800/40"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-200">
                                Attempt #{att.attempt_number}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  att.status === "SUCCESS"
                                    ? "bg-emerald-500/20 text-emerald-300"
                                    : att.status === "DEAD_LETTER"
                                    ? "bg-rose-500/20 text-rose-300"
                                    : "bg-amber-500/20 text-amber-300"
                                }`}
                              >
                                {att.status_code ? `HTTP ${att.status_code}` : att.status}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center justify-between text-slate-400 text-[10px]">
                              <span>Latency: {att.execution_time_ms} ms</span>
                              <span>{new Date(att.created_at).toLocaleTimeString()}</span>
                            </div>
                            {att.error_message && (
                              <div className="mt-1.5 p-1.5 bg-slate-950/80 rounded border border-rose-900/40 text-[10px] text-rose-300 break-words">
                                {att.error_message}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* TAB 2: TEST BENCH (INTERACTIVE DISPATCHER) */}
        {activeTab === "bench" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/50 p-6">
              <div className="border-b border-slate-800 pb-4 mb-6">
                <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                  <Send className="w-5 h-5 text-indigo-400" />
                  <span>Webhook Event Dispatcher</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Send real-time events to the FastAPI gateway with cryptographic HMAC signing and idempotency locks.
                </p>
              </div>

              {/* Template Selectors */}
              <div className="mb-5">
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                  Pre-configured Event Templates:
                </label>
                <div className="flex flex-wrap gap-2">
                  {DEFAULT_TEMPLATES.map((tmpl) => (
                    <button
                      key={tmpl.type}
                      type="button"
                      onClick={() => {
                        setSelectedTemplate(tmpl.type);
                        setEventType(tmpl.type);
                        setPayloadStr(JSON.stringify(tmpl.payload, null, 2));
                        setIdempotencyKey(`idem_${Math.random().toString(36).substring(2, 11)}`);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono transition border ${
                        selectedTemplate === tmpl.type
                          ? "bg-indigo-600/30 text-indigo-200 border-indigo-500/50"
                          : "bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      {tmpl.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Event Type & Idempotency Key */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Event Type (Topic):
                  </label>
                  <input
                    type="text"
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value)}
                    placeholder="e.g. invoice.paid"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-slate-300">
                      Idempotency-Key:
                    </label>
                    <button
                      type="button"
                      onClick={() => setIdempotencyKey(`idem_${Math.random().toString(36).substring(2, 11)}`)}
                      className="text-[10px] text-indigo-400 hover:underline"
                    >
                      Generate New
                    </button>
                  </div>
                  <input
                    type="text"
                    value={idempotencyKey}
                    onChange={(e) => setIdempotencyKey(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* JSON Payload Editor */}
              <div className="mb-5">
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  JSON Payload Body:
                </label>
                <textarea
                  rows={7}
                  value={payloadStr}
                  onChange={(e) => setPayloadStr(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-emerald-300 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Dispatch Action & Conflict Simulator */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleDispatch}
                  disabled={isDispatching}
                  className="flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition shadow-lg shadow-indigo-600/20"
                >
                  <Send className="w-4 h-4" />
                  <span>{isDispatching ? "Ingesting..." : "Send Event (HTTP 202)"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDispatch}
                  title="Sends the identical request again with the same idempotency key to demonstrate duplicate filtering"
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition"
                >
                  Test Duplicate Key (HTTP 409)
                </button>
              </div>

              {/* Feedback Alert */}
              {dispatchStatus && (
                <div
                  className={`mt-4 p-3.5 rounded-lg border text-xs flex items-center space-x-2.5 ${
                    dispatchStatus.type === "success"
                      ? "bg-emerald-950/30 text-emerald-300 border-emerald-800/50"
                      : dispatchStatus.type === "conflict"
                      ? "bg-amber-950/30 text-amber-300 border-amber-800/50"
                      : "bg-rose-950/30 text-rose-300 border-rose-800/50"
                  }`}
                >
                  {dispatchStatus.type === "success" ? (
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span>{dispatchStatus.message}</span>
                </div>
              )}
            </div>

            {/* Architecture Explainer Side Card */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 flex flex-col justify-between">
              <div className="space-y-4 text-xs text-slate-300">
                <h4 className="text-sm font-bold text-white flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>How HookPulse Protects Deliveries</span>
                </h4>

                <div className="space-y-3">
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="font-bold text-indigo-300 block mb-1">1. Sub-Millisecond Idempotency</span>
                    <p className="text-slate-400 text-[11px]">
                      Redis distributed locks (`SET NX EX`) reject duplicate requests in O(1) time before persisting to database.
                    </p>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="font-bold text-sky-300 block mb-1">2. Cryptographic HMAC-SHA256</span>
                    <p className="text-slate-400 text-[11px]">
                      Every outgoing delivery calculates an `X-HookPulse-Signature` header verified with constant-time equality checks.
                    </p>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="font-bold text-amber-300 block mb-1">3. Truncated Exponential Backoff + Jitter</span>
                    <p className="text-slate-400 text-[11px]">
                      Failed HTTP deliveries retry exponentially with random jitter to avoid thundering-herd spikes on receivers.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
                <span>Config: 3 Max Retries</span>
                <span>Timeout: 5s</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: SUBSCRIPTIONS & TARGETS */}
        {activeTab === "subscriptions" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">Registered Webhook Subscriptions</h3>
                <p className="text-xs text-slate-400">
                  Target endpoints that receive dispatched events based on exact or wildcard pattern matches.
                </p>
              </div>

              <button
                onClick={() => setShowSubModal(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition"
              >
                <Plus className="w-4 h-4" />
                <span>Add Destination</span>
              </button>
            </div>

            {subscriptions.length === 0 ? (
              <div className="py-16 text-center border border-slate-800 rounded-xl bg-slate-900/40 text-slate-500 text-sm">
                <Layers className="w-8 h-8 mx-auto mb-3 opacity-40" />
                No subscriptions created yet. Register your first webhook target endpoint!
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {subscriptions.map((sub) => (
                  <div
                    key={sub.id}
                    className="p-5 rounded-xl border border-slate-800 bg-slate-900/60 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-white text-sm">{sub.name}</span>
                        <button
                          onClick={() => handleDeleteSubscription(sub.id)}
                          className="text-slate-500 hover:text-rose-400 transition"
                          title="Delete subscription"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="text-xs font-mono text-slate-400 break-all bg-slate-950 p-2 rounded border border-slate-800/80 mb-3">
                        {sub.target_url}
                      </div>

                      {/* Subscribed patterns */}
                      <div className="mb-3">
                        <span className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">
                          Subscribed Topics:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {sub.subscribed_events.map((pattern, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded text-[10px] font-mono bg-sky-950/40 text-sky-300 border border-sky-800/40"
                            >
                              {pattern}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Secret key */}
                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-500 flex items-center space-x-1">
                        <Key className="w-3.5 h-3.5" />
                        <span>Secret:</span>
                      </span>
                      <button
                        onClick={() => copyToClipboard(sub.secret_key, sub.id)}
                        className="flex items-center space-x-1 text-slate-300 hover:text-white bg-slate-950 px-2 py-1 rounded border border-slate-800"
                      >
                        {copiedKey === sub.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-[10px] text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span className="text-[10px]">hp_sec_...</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: DEAD-LETTER QUEUE (DLQ) */}
        {activeTab === "dlq" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
                <span>Dead-Letter Queue (DLQ)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Events that failed all {3} exponential backoff retry cycles. You can inspect failure reasons and trigger manual re-delivery.
              </p>
            </div>

            {dlqCount === 0 ? (
              <div className="py-16 text-center border border-slate-800 rounded-xl bg-slate-900/40 text-slate-400 text-sm">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3 opacity-80" />
                <p className="font-semibold text-white">DLQ is completely clean!</p>
                <p className="text-xs text-slate-500 mt-1">All events have been delivered successfully.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Event ID</th>
                      <th className="py-3 px-4">Topic</th>
                      <th className="py-3 px-4">Idempotency Key</th>
                      <th className="py-3 px-4">Failed Time</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {events
                      .filter((e) => e.status === "DEAD_LETTER")
                      .map((evt) => (
                        <tr key={evt.id} className="hover:bg-slate-800/30">
                          <td className="py-3 px-4 text-rose-300">{evt.id}</td>
                          <td className="py-3 px-4 font-semibold text-white">{evt.event_type}</td>
                          <td className="py-3 px-4 text-slate-400">{evt.idempotency_key}</td>
                          <td className="py-3 px-4 text-slate-500">
                            {new Date(evt.created_at).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => handleRetryEvent(evt.id)}
                              className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-semibold transition"
                            >
                              Re-dispatch
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* MODAL: ADD SUBSCRIPTION */}
      {showSubModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Add Webhook Destination</h3>
            <p className="text-xs text-slate-400 mb-4">
              Events matching your pattern filters will be cryptographically signed and dispatched here.
            </p>

            <form onSubmit={handleCreateSubscription} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Subscriber Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Audit Service or Payment Gateway"
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Target Webhook URL</label>
                <input
                  type="url"
                  required
                  placeholder="https://example.com/webhooks"
                  value={subUrl}
                  onChange={(e) => setSubUrl(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Subscribed Event Patterns (comma separated)
                </label>
                <input
                  type="text"
                  placeholder="invoice.*, payment.succeeded, *"
                  value={subPatterns}
                  onChange={(e) => setSubPatterns(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Wildcards supported (e.g. `order.*` matches `order.created`, `order.cancelled`). Use `*` for all.
                </span>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowSubModal(false)}
                  className="px-4 py-2 text-slate-400 hover:text-white rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingSub}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg font-semibold transition"
                >
                  {creatingSub ? "Saving..." : "Create Destination"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
