import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  ExternalLink, 
  Image as ImageIcon, 
  Camera, 
  RefreshCcw, 
  CheckCircle2, 
  AlertCircle,
  Link2,
  Trash2
} from 'lucide-react';
import { decodeQRWithEnhancement } from './lib/qr-utils';

interface DecodeResult {
  data: string;
  timestamp: number;
  imageUrl: string;
}

export default function App() {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<DecodeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const processImage = async (file: File) => {
    setIsProcessing(true);
    setError(null);
    setResult(null);

    try {
      const imageUrl = URL.createObjectURL(file);
      const decodedData = await decodeQRWithEnhancement(imageUrl);

      if (decodedData) {
        setResult({
          data: decodedData,
          timestamp: Date.now(),
          imageUrl
        });
      } else {
        setError("QR 코드를 찾을 수 없거나 인식할 수 없습니다. 더 선명한 사진을 사용해 보세요.");
        // We still show the image but with an error
      }
    } catch (err) {
      console.error(err);
      setError("이미지를 처리하는 중 오류가 발생했습니다.");
    } finally {
      setIsProcessing(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processImage(e.target.files[0]);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processImage(e.dataTransfer.files[0]);
    }
  };

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
      }
    } catch (err) {
      setError("카메라에 접근할 수 없습니다. 권한을 확인해 주세요.");
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setCameraActive(false);
    }
  };

  const captureFrame = async () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(async (blob) => {
          if (blob) {
            const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
            stopCamera();
            processImage(file);
          }
        }, 'image/jpeg');
      }
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
    setIsProcessing(false);
  };

  const isUrl = (text: string) => {
    try {
      new URL(text);
      return true;
    } catch {
      return text.startsWith('http') || text.includes('.');
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen w-full bg-[#0A0A0A] text-white font-sans overflow-hidden p-6 md:p-8 gap-8">
      {/* Sidebar */}
      <aside className="w-full lg:w-1/3 flex flex-col justify-between h-full space-y-8">
        <div className="space-y-8">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-2"
          >
            <h1 className="text-7xl md:text-8xl font-black leading-none tracking-tighter uppercase">
              QR<br />
              <span className="text-blue-500">SCAN</span>
            </h1>
            <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-zinc-500">Enhanced Engine v2.0</p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="p-6 bg-white/5 rounded-3xl accent-border"
          >
            <p className="text-sm text-zinc-400 leading-relaxed italic">
              Upload photos with small or blurry QR codes. Our engine auto-corrects contrast and clarity to extract hidden links instantly.
            </p>
          </motion.div>
        </div>

        <div className="space-y-4 hidden md:block">
          <div className="flex justify-between items-end border-b border-white/10 pb-2">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">System Status</span>
            <span className="font-mono text-green-400 text-xs">READY</span>
          </div>
          <div className="flex justify-between items-end border-b border-white/10 pb-2">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Enhancement Mode</span>
            <span className="font-mono text-blue-400 text-xs">{isProcessing ? 'SCANNING...' : 'AUTO-HD'}</span>
          </div>
          <div className="flex justify-between items-end border-b border-white/10 pb-2">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Last Action</span>
            <span className="font-mono text-zinc-400 text-xs">
              {result ? new Date(result.timestamp).toLocaleTimeString() : '--:--:--'}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col gap-6 overflow-hidden">
        <AnimatePresence mode="wait">
          {cameraActive ? (
            <motion.div 
              key="camera"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="relative flex-1 bg-black rounded-[2.5rem] overflow-hidden accent-border group shadow-2xl"
            >
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                className="w-full h-full object-cover opacity-80"
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-64 h-64 border-2 border-blue-500/50 rounded-3xl border-dashed animate-pulse" />
              </div>
              <div className="absolute top-6 left-6 flex gap-2">
                <div className="bg-blue-600/20 backdrop-blur-md px-3 py-1 rounded-full text-[8px] font-bold tracking-widest border border-blue-500/30 text-blue-400 uppercase">Live Feed</div>
              </div>
              <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-4 px-6">
                <button 
                  onClick={stopCamera}
                  className="px-8 py-3 bg-white/5 hover:bg-white/10 backdrop-blur-md text-white rounded-full transition-all border border-white/10 text-xs font-bold uppercase tracking-widest"
                >
                  Cancel
                </button>
                <button 
                  onClick={captureFrame}
                  className="px-10 py-3 bg-blue-600 text-white rounded-full transition-all hover:scale-105 active:scale-95 shadow-lg font-bold uppercase tracking-widest flex items-center gap-2"
                >
                  <Camera size={16} />
                  Capture
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex-1 flex flex-col gap-6 overflow-hidden"
            >
              {/* Drop Area */}
              <div 
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  relative flex-1 bg-zinc-900 rounded-[2.5rem] overflow-hidden accent-border flex items-center justify-center group cursor-pointer transition-all duration-500
                  ${isDragging ? 'bg-zinc-800 border-zinc-500' : ''}
                  ${isProcessing ? 'pointer-events-none opacity-50' : ''}
                `}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={onFileChange} 
                  accept="image/*" 
                  className="hidden" 
                />
                
                <div className="absolute inset-0 opacity-20 dot-pattern" />
                
                <div className="z-10 flex flex-col items-center text-center p-12 space-y-6">
                  <motion.div 
                    whileHover={{ scale: 1.05 }}
                    className="w-48 h-48 bg-zinc-800 rounded-3xl flex items-center justify-center border-4 border-dashed border-zinc-700/50 group-hover:border-blue-500/50 transition-colors"
                  >
                    {isProcessing ? (
                      <RefreshCcw size={48} className="text-blue-500 animate-spin" />
                    ) : (
                      <Upload size={48} className="text-zinc-600 group-hover:text-blue-500 transition-colors" />
                    )}
                  </motion.div>
                  <div className="space-y-2">
                    <h2 className="text-4xl font-bold tracking-tight">Drop QR Here</h2>
                    <p className="text-zinc-500 font-medium tracking-wide">Or click to select an image</p>
                  </div>
                  
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      startCamera();
                    }}
                    className="mt-4 px-8 py-3 bg-white text-black rounded-full font-bold uppercase tracking-widest text-xs hover:scale-105 transition-all shadow-xl active:scale-95 flex items-center gap-2"
                  >
                    <Camera size={14} />
                    Open Camera
                  </button>
                </div>

                {/* Info Pills */}
                <div className="absolute bottom-6 left-6 right-6 flex flex-wrap gap-3 pointer-events-none">
                  <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-full text-[9px] font-bold tracking-widest accent-border uppercase">Contrast Auto</div>
                  <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-full text-[9px] font-bold tracking-widest accent-border uppercase">Denoise On</div>
                  <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-full text-[9px] font-bold tracking-widest accent-border uppercase">Upscale 2X</div>
                </div>
              </div>

              {/* Result Area */}
              <AnimatePresence mode="wait">
                {(result || error) && (
                  <motion.section 
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 50 }}
                    className={`
                      relative rounded-[2rem] p-8 flex flex-col md:flex-row items-center justify-between gap-6 transition-all duration-500
                      ${result ? 'bg-blue-600 qr-glow' : 'bg-red-900 border border-red-500/30'}
                    `}
                  >
                    <div className="flex items-center gap-6 flex-1 w-full overflow-hidden">
                      {result?.imageUrl && (
                        <div className="w-20 h-20 bg-black/20 rounded-2xl overflow-hidden shrink-0 hidden sm:block">
                          <img src={result.imageUrl} className="w-full h-full object-cover" alt="Scan" />
                        </div>
                      )}
                      
                      <div className="space-y-1 flex-1 overflow-hidden">
                        <span className="text-[10px] uppercase font-black tracking-[0.2em] opacity-80">
                          {result ? 'Link Detected' : 'Scan Output'}
                        </span>
                        <h3 className="text-xl md:text-3xl font-black truncate max-w-full">
                          {result ? result.data : error}
                        </h3>
                        <p className="text-xs opacity-60 font-medium italic">
                          {result ? `Metadata: v.3.1 | Secure Extract` : 'Engine Feedback: Error'}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3 shrink-0">
                      {result && isUrl(result.data) && (
                        <a 
                          href={result.data.startsWith('http') ? result.data : `https://${result.data}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="h-16 w-16 bg-white text-blue-600 rounded-2xl flex items-center justify-center hover:scale-105 transition-transform active:scale-95 shadow-xl"
                        >
                          <ExternalLink size={24} strokeWidth={3} />
                        </a>
                      )}
                      <button 
                        onClick={reset}
                        className="h-16 w-16 bg-black/20 text-white rounded-2xl flex items-center justify-center hover:bg-black/40 transition-colors active:scale-95"
                      >
                        <Trash2 size={24} strokeWidth={2.5} />
                      </button>
                    </div>
                  </motion.section>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
