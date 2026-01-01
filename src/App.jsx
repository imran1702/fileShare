import React, { useState, useEffect, useRef } from "react";
import Peer from "peerjs";
import {
  Share2, Paperclip, Send, Smartphone, Moon, Sun, History,
  Trash2, Check, Copy, DownloadCloud, Files, X, LogOut
} from "lucide-react";

const CHUNK_SIZE = 16384; 

function App() {
  const [peerId, setPeerId] = useState("");
  const [remotePeerId, setRemotePeerId] = useState("");
  const [connectedPeerId, setConnectedPeerId] = useState(""); // নতুন স্টেট কানেক্টেড আইডি রাখার জন্য
  const [connection, setConnection] = useState(null);
  const [files, setFiles] = useState([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Initializing...");
  const [darkMode, setDarkMode] = useState(false);
  const [history, setHistory] = useState([]);
  const [copied, setCopied] = useState(false);
  
  const [pendingBatch, setPendingBatch] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const peerInstance = useRef(null);
  const connRef = useRef(null);
  const filesRef = useRef([]); 
  const receivedChunks = useRef([]);
  const fileMetadata = useRef(null);

  const generateFormattedId = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const gen = (len) => Array.from({ length: len }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join("");
    return `${gen(4)}-${gen(4)}`;
  };

  useEffect(() => {
    const customId = generateFormattedId();
    const peer = new Peer(customId);

    peer.on("open", (id) => {
      setPeerId(id);
      setStatus("Ready to Share");
    });

    peer.on("connection", (conn) => {
      handleNewConnection(conn);
    });

    peerInstance.current = peer;
    return () => peerInstance.current?.destroy();
  }, []);

  const handleNewConnection = (conn) => {
    if (connRef.current) {
      connRef.current.close();
    }
    
    connRef.current = conn;
    setConnection(conn);
    setConnectedPeerId(conn.peer); // অপর পাশের আইডি সেভ করা হচ্ছে
    setStatus("Peer Connected!");

    conn.on("open", () => {
      setupDataListeners(conn);
    });

    conn.on("close", () => {
      resetConnectionState();
    });

    conn.on("error", () => {
      resetConnectionState();
    });
    
    setupDataListeners(conn);
  };

  const resetConnectionState = () => {
    connRef.current = null;
    setConnection(null);
    setConnectedPeerId("");
    setRemotePeerId("");
    setStatus("Disconnected / Ready");
    setProgress(0);
  };

  const disconnectPeer = () => {
    if (connRef.current) {
      connRef.current.close();
    }
    resetConnectionState();
  };

  const setupDataListeners = (conn) => {
    conn.on("data", (data) => {
      if (data.type === "batch-request") {
        setPendingBatch(data);
        setShowModal(true);
      } 
      else if (data.type === "permission-granted") {
        const filteredFiles = filesRef.current.filter(f => data.acceptedFiles.includes(f.name));
        filesRef.current = filteredFiles;
        if(filteredFiles.length > 0) {
            startBatchStreaming(conn, 0);
        } else {
            setStatus("No files were accepted.");
        }
      }
      else if (data.type === "permission-denied") {
        setStatus("Transfer Rejected");
      }
      else if (data.type === "file-metadata") {
        receivedChunks.current = [];
        fileMetadata.current = data;
        setStatus(`Receiving: ${data.name}`);
        setCurrentFileIndex(data.index);
      } 
      else if (data.type === "chunk") {
        receivedChunks.current.push(data.chunk);
        const currentProgress = Math.min(100, Math.round(((receivedChunks.current.length * CHUNK_SIZE) / fileMetadata.current.size) * 100));
        setProgress(currentProgress);

        if (data.last) {
          const blob = new Blob(receivedChunks.current);
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = fileMetadata.current.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          addToHistory(fileMetadata.current.name, "Received");
          if (data.isLastInBatch) {
            setStatus("Transfer Complete!");
            setProgress(0);
          }
          receivedChunks.current = [];
        }
      }
    });
  };

  const startBatchStreaming = (conn, index) => {
    const currentFiles = filesRef.current;
    if (index >= currentFiles.length) {
      setStatus("All Files Sent!");
      setFiles([]);
      filesRef.current = [];
      setProgress(0);
      return;
    }

    const currentFile = currentFiles[index];
    setCurrentFileIndex(index);
    setStatus(`Sending: ${currentFile.name}`);

    conn.send({
      type: "file-metadata",
      name: currentFile.name,
      size: currentFile.size,
      index: index,
      total: currentFiles.length
    });

    let offset = 0;
    const reader = new FileReader();
    const readNextChunk = () => {
      const slice = currentFile.slice(offset, offset + CHUNK_SIZE);
      reader.readAsArrayBuffer(slice);
    };

    reader.onload = (e) => {
      const chunk = e.target.result;
      offset += chunk.byteLength;
      const isLastChunk = offset >= currentFile.size;
      conn.send({
        type: "chunk",
        chunk: chunk,
        last: isLastChunk,
        isLastInBatch: isLastChunk && (index === currentFiles.length - 1)
      });
      setProgress(Math.round((offset / currentFile.size) * 100));
      if (!isLastChunk) {
        readNextChunk();
      } else {
        addToHistory(currentFile.name, "Sent");
        setTimeout(() => startBatchStreaming(conn, index + 1), 500);
      }
    };
    readNextChunk();
  };

  const connectToPeer = () => {
    if (!remotePeerId) return;
    setStatus("Connecting...");
    const conn = peerInstance.current.connect(remotePeerId.trim());
    handleNewConnection(conn);
  };

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles(selectedFiles);
    filesRef.current = selectedFiles; 
  };

  const sendBatchRequest = () => {
    if (filesRef.current.length === 0 || !connRef.current) return;
    setStatus("Waiting for Approval...");
    connRef.current.send({ 
      type: "batch-request", 
      files: filesRef.current.map(f => ({ name: f.name, size: f.size })),
      totalCount: filesRef.current.length 
    });
  };

  const handleRejectFile = (fileName) => {
    setPendingBatch(prev => ({
      ...prev,
      files: prev.files.filter(f => f.name !== fileName),
      totalCount: prev.totalCount - 1
    }));
  };

  const handleAcceptBatch = () => {
    if (pendingBatch.files.length === 0) {
      connRef.current.send({ type: "permission-denied" });
    } else {
      connRef.current.send({ 
        type: "permission-granted", 
        acceptedFiles: pendingBatch.files.map(f => f.name) 
      });
    }
    setShowModal(false);
  };

  const addToHistory = (name, type) => {
    const entry = { id: Date.now(), name, type, time: new Date().toLocaleTimeString() };
    setHistory(prev => [entry, ...prev]);
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-900"} p-4 flex flex-col items-center font-sans`}>
      
      <div className="w-full max-w-md flex justify-between items-center py-6">
        <h1 className="text-xl font-black italic text-indigo-600">QuickShare.</h1>
        <button onClick={() => setDarkMode(!darkMode)} className="p-2.5 bg-white dark:bg-[#898989] shadow rounded-xl">
          {darkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>

      <div className={`max-w-md w-full rounded-[2.5rem] shadow-2xl border ${darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"}`}>
        <div className="p-8 space-y-6">
          
          <div className="p-6 bg-indigo-600 rounded-3xl text-white shadow-lg">
            <p className="text-[10px] font-bold uppercase opacity-80 mb-1 tracking-widest">Your Device ID</p>
            <div className="flex items-center justify-between">
              <span className="text-xl font-mono font-black">{peerId || "Genarating ID"}</span>
              <button onClick={() => {navigator.clipboard.writeText(peerId); setCopied(true); setTimeout(()=>setCopied(false), 2000)}}>
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            {!connection ? (
              <>
                <input 
                  type="text" placeholder="Enter Receiver ID" 
                  className={`flex-1 px-4 py-3 rounded-xl border-2 outline-none font-bold ${darkMode ? "bg-slate-950 border-slate-800 focus:border-indigo-600" : "bg-slate-50 border-slate-100 focus:border-indigo-400"}`}
                  value={remotePeerId} onChange={e => setRemotePeerId(e.target.value)}
                />
                <button onClick={connectToPeer} className="px-5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg active:scale-95 transition-transform"><Smartphone size={20} /></button>
              </>
            ) : (
              <div className={`flex-1 flex items-center justify-between px-4 py-3 rounded-xl border-2 ${darkMode ? "bg-slate-950 border-indigo-900" : "bg-indigo-50 border-indigo-100"}`}>
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse flex-shrink-0" />
                  {/* এখানে আপনার কাঙ্ক্ষিত পরিবর্তনটি করা হয়েছে */}
                  <span className="text-[11px] font-black uppercase truncate">Connected to {connectedPeerId}</span>
                </div>
                <button onClick={disconnectPeer} className="flex items-center gap-1 text-[9px] font-black uppercase text-red-500 bg-red-500/10 px-2 py-1.5 rounded-lg transition-colors flex-shrink-0">
                  <LogOut size={12} /> Disconnect
                </button>
              </div>
            )}
          </div>

          <div className={`relative border-2 border-dashed p-8 rounded-3xl text-center transition-colors ${files.length > 0 ? "border-indigo-500 bg-indigo-500/5" : "border-slate-300 dark:border-slate-800"}`}>
            <input type="file" multiple className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFileChange} disabled={!connection} />
            <Paperclip className={`mx-auto mb-2 ${files.length > 0 ? "text-indigo-600" : "text-slate-400"}`} />
            <p className="text-xs font-bold uppercase tracking-tight">{files.length > 0 ? `${files.length} Files Selected` : "Click to select files"}</p>
          </div>

          <button 
            onClick={sendBatchRequest} 
            disabled={!connection || files.length === 0}
            className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest disabled:opacity-20 shadow-lg active:scale-95 transition-all"
          >
            Send Now
          </button>

          {progress > 0 && (
            <div className="space-y-2 animate-in fade-in">
              <div className="flex justify-between text-[10px] font-black uppercase tracking-tighter">
                <span className="truncate max-w-[150px]">{files[currentFileIndex]?.name || "Transferring..."}</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-950 h-2 rounded-full overflow-hidden">
                <div className="bg-indigo-600 h-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          <div className="flex items-center justify-center gap-2">
             <p className="text-[9px] font-bold uppercase opacity-40">{status}</p>
          </div>
        </div>
      </div>

      {/* Modern Receiver Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className={`max-w-sm w-full p-6 rounded-[2rem] ${darkMode ? 'bg-slate-900 border border-slate-800' : 'bg-white shadow-2xl'}`}>
            <div className="text-center mb-4">
                <DownloadCloud className="mx-auto mb-2 text-indigo-500" size={32} />
                <h3 className="text-lg font-black tracking-tight">Incoming Batch</h3>
                <p className="text-[10px] font-bold opacity-50 uppercase tracking-widest">Select files you want to keep</p>
            </div>
            <div className="max-h-48 overflow-y-auto mb-6 space-y-2 pr-2 custom-scrollbar">
                {pendingBatch?.files.map((f, i) => (
                    <div key={i} className={`flex items-center justify-between p-3 rounded-xl border ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-100'}`}>
                        <div className="overflow-hidden">
                            <p className="text-[10px] font-bold truncate max-w-[180px]">{f.name}</p>
                            <p className="text-[8px] opacity-40 font-black uppercase">{(f.size/1024/1024).toFixed(2)} MB</p>
                        </div>
                        <button onClick={() => handleRejectFile(f.name)} className="p-1.5 hover:bg-red-500/10 text-red-500 rounded-lg transition-colors"><X size={14} /></button>
                    </div>
                ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => { connRef.current.send({ type: "permission-denied" }); setShowModal(false); }} className="flex-1 py-3 rounded-xl font-black text-[10px] uppercase bg-slate-100 dark:bg-slate-800">Cancel</button>
              <button onClick={handleAcceptBatch} disabled={pendingBatch?.files.length === 0} className="flex-1 py-3 rounded-xl font-black text-[10px] uppercase bg-indigo-600 text-white disabled:opacity-50">Accept {pendingBatch?.files.length} Files</button>
            </div>
          </div>
        </div>
      )}

      {/* Activity Log */}
      <div className="w-full max-w-md mt-10 mb-10">
        <div className="flex justify-between items-center mb-4 px-2">
            <h2 className="text-[10px] font-black uppercase tracking-widest opacity-40">Recent Activity</h2>
            <button onClick={() => setHistory([])}><Trash2 size={14} className="text-red-400" /></button>
        </div>
        <div className="space-y-2">
          {history.length === 0 && <p className="text-center py-6 text-[10px] opacity-20 font-bold uppercase italic">No recent transfers</p>}
          {history.map(item => (
            <div key={item.id} className={`p-4 rounded-xl border flex justify-between items-center ${darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100 shadow-sm"}`}>
              <div className="overflow-hidden">
                <p className="text-xs font-bold truncate max-w-[180px]">{item.name}</p>
                <p className="text-[8px] opacity-30 font-black">{item.time}</p>
              </div>
              <span className={`text-[8px] px-2 py-1 rounded font-black text-white ${item.type === "Sent" ? "bg-indigo-500" : "bg-emerald-500"}`}>{item.type}</span>
            </div>
          ))}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #6366f1; border-radius: 10px; }
      `}} />
    </div>
  );
}

export default App;