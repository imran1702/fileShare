import React, { useState, useEffect, useRef } from "react";
import Peer from "peerjs";
import {
  Share2,
  Paperclip,
  Send,
  Smartphone,
  Moon,
  Sun,
  History,
  Trash2,
  Check,
  Copy,
  DownloadCloud, // নতুন আইকন
} from "lucide-react";

const CHUNK_SIZE = 16384;

function App() {
  const [peerId, setPeerId] = useState("");
  const [remotePeerId, setRemotePeerId] = useState("");
  const [connection, setConnection] = useState(null);
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Initializing...");
  const [darkMode, setDarkMode] = useState(false);
  const [history, setHistory] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(false);

  // PWA Install State
  const [installPrompt, setInstallPrompt] = useState(null);

  const peerInstance = useRef(null);
  const receivedChunks = useRef([]);
  const fileMetadata = useRef(null);

  const generateFormattedId = () => {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const gen = (len) =>
      Array.from({ length: len }, () =>
        chars.charAt(Math.floor(Math.random() * chars.length))
      ).join("");
    return `${gen(4)}-${gen(4)}`;
  };

  useEffect(() => {
    // PWA: Listen for install prompt
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    });

    const customId = generateFormattedId();
    const peer = new Peer(customId);

    peer.on("open", (id) => {
      setPeerId(id);
      setStatus("Ready to Share");
    });

    peer.on("connection", (conn) => {
      setConnection(conn);
      setStatus("Peer Connected!");
      setupDataListeners(conn);
    });

    peer.on("error", (err) => {
      if (err.type === "unavailable-id") {
        window.location.reload();
      } else {
        console.error(err);
        setStatus("Error: " + err.type);
      }
    });

    peerInstance.current = peer;
    return () => {
      if (peerInstance.current) peerInstance.current.destroy();
    };
  }, []);

  // Install Function
  const handleInstallClick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") setInstallPrompt(null);
  };

  const setupDataListeners = (conn) => {
    conn.on("data", (data) => {
      if (data.type === "metadata") {
        receivedChunks.current = [];
        fileMetadata.current = data;
        setStatus(`Receiving: ${data.name}`);
      } else if (data.type === "chunk") {
        receivedChunks.current.push(data.chunk);
        const percent = Math.min(
          100,
          Math.round(
            ((receivedChunks.current.length * CHUNK_SIZE) /
              fileMetadata.current.size) *
              100
          )
        );
        setProgress(percent);

        if (data.last) {
          const blob = new Blob(receivedChunks.current);
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = fileMetadata.current.name;
          a.click();
          addToHistory(fileMetadata.current.name, "Received");
          setStatus("File Received!");
          setProgress(0);
          receivedChunks.current = [];
        }
      }
    });

    conn.on("close", () => {
      setConnection(null);
      setStatus("Disconnected");
    });
  };

  const addToHistory = (fileName, type) => {
    const newEntry = {
      id: Date.now(),
      name: fileName,
      type: type,
      time: new Date().toLocaleTimeString(),
    };
    setHistory((prev) => [newEntry, ...prev]);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(peerId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const connectToPeer = () => {
    if (!remotePeerId || !peerInstance.current) return;
    setStatus("Connecting...");
    const conn = peerInstance.current.connect(remotePeerId.trim());

    conn.on("open", () => {
      setConnection(conn);
      setStatus("Connected!");
      setupDataListeners(conn);
    });

    conn.on("error", (err) => {
      setStatus("Connection Failed");
      console.error(err);
    });
  };

  const sendFile = () => {
    if (!file || !connection) return;

    setStatus("Sending...");
    connection.send({ type: "metadata", name: file.name, size: file.size });

    let offset = 0;
    const reader = new FileReader();

    const readNextChunk = () => {
      const slice = file.slice(offset, offset + CHUNK_SIZE);
      reader.readAsArrayBuffer(slice);
    };

    reader.onload = (e) => {
      const chunk = e.target.result;
      offset += chunk.byteLength;
      connection.send({
        type: "chunk",
        chunk: chunk,
        last: offset >= file.size,
      });

      setProgress(Math.round((offset / file.size) * 100));

      if (offset < file.size) {
        readNextChunk();
      } else {
        addToHistory(file.name, "Sent");
        setStatus("File Sent!");
        setFile(null);
        setTimeout(() => setProgress(0), 2000);
      }
    };
    readNextChunk();
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setIsDragging(true);
    else if (e.type === "dragleave") setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (connection && e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div
      className={`min-h-screen transition-all duration-500 ${
        darkMode ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-900"
      } p-4 flex flex-col items-center font-sans relative`}
    >
      {/* Top Controls: Install & Dark Mode */}
      <div className="absolute top-6 left-6 right-6 flex justify-between items-center max-w-md mx-auto w-full">
        {installPrompt && (
          <button
            onClick={handleInstallClick}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold animate-bounce shadow-lg"
          >
            <DownloadCloud size={16} /> Install App
          </button>
        )}
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="ml-auto p-3 rounded-2xl bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-800 transition-transform active:scale-90"
        >
          {darkMode ? (
            <Sun size={20} className="text-yellow-400" />
          ) : (
            <Moon size={20} className="text-indigo-600" />
          )}
        </button>
      </div>

      <div
        className={`max-w-md w-full rounded-[2.5rem] shadow-2xl overflow-hidden border mt-20 transition-all duration-500 ${
          darkMode
            ? "bg-slate-900 border-slate-800"
            : "bg-white border-slate-100"
        }`}
      >
        <div className="bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-500 p-10 text-white text-center relative overflow-hidden">
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-white/20 rounded-3xl backdrop-blur-md border border-white/30">
              <Share2 size={36} strokeWidth={2.5} />
            </div>
          </div>
          <h1 className="text-3xl font-black tracking-tight italic">
            QuickShare
          </h1>
          <p className="text-blue-50 text-[10px] font-bold opacity-70 mt-2 uppercase tracking-[0.3em]">
            Direct P2P Transfer
          </p>
        </div>

        <div className="p-8 space-y-8">
          <div
            className={`p-6 rounded-[2rem] border transition-all ${
              darkMode
                ? "bg-slate-950/50 border-slate-800"
                : "bg-indigo-50/30 border-indigo-100"
            }`}
          >
            <label className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-3 block text-center">
              Your Device ID
            </label>
            <div className="flex items-center justify-between gap-4">
              <span className="text-2xl font-mono font-black tracking-wider text-slate-700 dark:text-indigo-300">
                {peerId || "••••-••••"}
              </span>
              <button
                onClick={copyToClipboard}
                className={`p-3 rounded-2xl transition-all ${
                  copied
                    ? "bg-green-500 text-white"
                    : "bg-indigo-600 text-white hover:shadow-lg active:scale-90"
                }`}
              >
                {copied ? (
                  <Check size={20} strokeWidth={3} />
                ) : (
                  <Copy size={20} strokeWidth={2.5} />
                )}
              </button>
            </div>
          </div>

          <div className="relative">
            <input
              type="text"
              placeholder="XXXX-XXXX"
              className={`w-full pl-6 pr-16 py-5 rounded-[1.5rem] border-2 font-mono font-bold text-lg outline-none transition-all ${
                darkMode
                  ? "bg-slate-950 border-slate-800 text-white focus:border-indigo-500"
                  : "bg-slate-50 border-slate-200 text-slate-800 focus:border-indigo-600"
              }`}
              value={remotePeerId}
              onChange={(e) => setRemotePeerId(e.target.value)}
            />
            <button
              onClick={connectToPeer}
              className="absolute right-3 top-3 bottom-3 px-4 bg-slate-900 dark:bg-indigo-600 text-white rounded-xl font-bold active:scale-95 shadow-md"
            >
              <Smartphone size={20} />
            </button>
          </div>

          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`relative p-10 rounded-[2rem] border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center gap-4 ${
              isDragging
                ? "border-indigo-500 bg-indigo-500/10 scale-105"
                : connection
                ? "border-indigo-400/50 opacity-100"
                : "border-slate-300 opacity-40 grayscale"
            } ${darkMode && !isDragging ? "border-slate-800" : ""}`}
          >
            <div
              className={`p-5 rounded-full ${
                isDragging
                  ? "bg-indigo-500 text-white animate-bounce"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-400"
              }`}
            >
              <Paperclip size={28} />
            </div>
            <div className="text-center">
              <p className="text-[11px] font-black uppercase tracking-widest leading-relaxed px-4 truncate max-w-[250px]">
                {file
                  ? file.name
                  : connection
                  ? "Drop or Browse"
                  : "Connect Peer First"}
              </p>
              {file && (
                <p className="text-[9px] opacity-50 mt-1 uppercase">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              )}
            </div>
            <input
              type="file"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={!connection}
              onChange={(e) => setFile(e.target.files[0])}
            />
          </div>

          <button
            onClick={sendFile}
            disabled={!connection || !file}
            className="w-full bg-indigo-600 text-white py-6 rounded-[1.5rem] font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-indigo-600/30 hover:bg-indigo-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 dark:disabled:text-slate-600 transition-all active:scale-95 flex items-center justify-center gap-4"
          >
            <Send size={18} strokeWidth={2.5} /> Transfer Now
          </button>

          {progress > 0 && (
            <div className="space-y-4 pt-4">
              <div className="flex justify-between items-end">
                <span className="text-[10px] font-black uppercase text-indigo-500 tracking-tighter italic animate-pulse">
                  Streaming Data...
                </span>
                <span className="text-xl font-mono font-black italic">
                  {progress}%
                </span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-950 rounded-full h-4 overflow-hidden border border-slate-200 dark:border-slate-800 p-1">
                <div
                  className="bg-gradient-to-r from-indigo-600 to-cyan-500 h-full rounded-full transition-all duration-300 shadow-[0_0_15px_rgba(79,70,229,0.5)]"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-center gap-4 pt-4 border-t border-slate-100 dark:border-slate-800/50">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                connection
                  ? "bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.8)] animate-pulse"
                  : "bg-slate-300"
              }`}
            />
            <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40">
              {status}
            </p>
          </div>
        </div>
      </div>

      {/* History */}
      <div
        className={`mt-10 max-w-md w-full rounded-[2rem] p-8 mb-12 transition-all duration-500 ${
          darkMode
            ? "bg-slate-900 shadow-2xl border border-slate-800"
            : "bg-white shadow-xl border border-slate-100"
        }`}
      >
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4 text-xs font-black uppercase tracking-[0.2em]">
            <div className="p-3 bg-indigo-500/10 rounded-2xl text-indigo-500">
              <History size={20} strokeWidth={2.5} />
            </div>
            Activity Logs
          </div>
          <button
            onClick={() => setHistory([])}
            className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-2xl transition-all"
          >
            <Trash2 size={20} />
          </button>
        </div>

        <div className="space-y-4 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
          {history.length === 0 ? (
            <div className="flex flex-col items-center py-12 opacity-20 grayscale">
              <Share2 size={48} strokeWidth={1} />
              <p className="text-[10px] font-black mt-4 uppercase tracking-widest">
                No Activity
              </p>
            </div>
          ) : (
            history.map((item) => (
              <div
                key={item.id}
                className={`flex justify-between items-center p-5 rounded-2xl border transition-all ${
                  darkMode
                    ? "bg-slate-950/40 border-slate-800"
                    : "bg-slate-50 border-slate-100"
                }`}
              >
                <div className="flex flex-col overflow-hidden mr-4 text-left">
                  <span className="font-bold text-sm truncate max-w-[180px] tracking-tight">
                    {item.name}
                  </span>
                  <span className="text-[9px] font-bold opacity-40 mt-1 uppercase italic tracking-tighter">
                    {item.time}
                  </span>
                </div>
                <span
                  className={`text-[9px] px-3 py-1.5 rounded-xl font-black uppercase tracking-widest shadow-sm ${
                    item.type === "Sent"
                      ? "bg-indigo-500 text-white"
                      : "bg-emerald-500 text-white"
                  }`}
                >
                  {item.type}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #6366f1; border-radius: 10px; opacity: 0.3; }
      `,
        }}
      />
    </div>
  );
}

export default App;
