import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, FastForward, Rewind, Camera, Video, Trash2, Check, Loader2, Maximize } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactPlayer from 'react-player';

const Player = ReactPlayer as any;

interface VideoPlayerProps {
  url: string;
  onClose?: () => void;
  title?: string;
}

export const CustomVideoPlayer: React.FC<VideoPlayerProps> = ({ url, onClose, title }) => {
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [played, setPlayed] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const playerRef = useRef<any>(null);

  const handlePlayPause = () => setPlaying(!playing);
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => setVolume(parseFloat(e.target.value));
  const handlePlaybackRateChange = (rate: number) => setPlaybackRate(rate);
  const handleProgress = (state: any) => {
    if (!seeking) setPlayed(state.played);
  };
  const handleSeekMouseDown = () => setSeeking(true);
  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => setPlayed(parseFloat(e.target.value));
  const handleSeekMouseUp = (e: React.MouseEvent<HTMLInputElement> | React.TouchEvent<HTMLInputElement>) => {
    setSeeking(false);
    playerRef.current?.seekTo(parseFloat((e.target as HTMLInputElement).value));
  };

  return (
    <div className="relative aspect-video group bg-black rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
      <Player
        ref={playerRef}
        url={url}
        playing={playing}
        volume={volume}
        playbackRate={playbackRate}
        onProgress={handleProgress}
        width="100%"
        height="100%"
        controls={false}
        className="absolute top-0 left-0"
        onError={() => console.error("Video load error")}
      />
      
      {/* Custom Controls Overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-6 opacity-0 group-hover:opacity-100 transition-opacity">
        {title && <p className="text-white font-bold text-sm mb-4 truncate italic">{title}</p>}
        
        {/* Progress Bar */}
        <div className="flex items-center gap-4 mb-4">
          <input
            type="range"
            min={0}
            max={0.999999}
            step="any"
            value={played}
            onMouseDown={handleSeekMouseDown}
            onChange={handleSeekChange}
            onMouseUp={handleSeekMouseUp}
            className="w-full accent-brand h-1 bg-white/20 rounded-full cursor-pointer"
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={handlePlayPause} title={playing ? "Pause" : "Play"} className="p-2 bg-brand rounded-full text-white hover:scale-110 transition-transform">
              {playing ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
            </button>
            
            <div className="flex items-center gap-2 bg-zinc-900/80 px-3 py-1.5 rounded-xl border border-white/10">
              <Volume2 className="w-4 h-4 text-zinc-400" />
              <input
                type="range"
                min={0}
                max={1}
                step="any"
                value={volume}
                onChange={handleVolumeChange}
                className="w-16 accent-brand h-1 bg-white/10 rounded-full"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
             <div className="flex items-center gap-1 bg-black/50 px-2 py-1 rounded-lg border border-white/5">
                {[0.5, 1, 1.5, 2].map((rate) => (
                  <button
                    key={rate}
                    title={`Set playback speed to ${rate}x`}
                    onClick={() => handlePlaybackRateChange(rate)}
                    className={`text-[10px] font-black px-2 py-1 rounded ${playbackRate === rate ? 'bg-brand text-white' : 'text-zinc-500 hover:text-white'}`}
                  >
                    {rate}x
                  </button>
                ))}
            </div>
            {onClose && (
              <button onClick={onClose} title="Maximize" className="p-2 text-zinc-400 hover:text-white">
                <Maximize className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const VideoRecorder = ({ onRecordingComplete }: { onRecordingComplete: (blob: Blob) => void }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true });
      setPreviewStream(stream);
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraActive(true);
    } catch (err) {
      console.error("Camera access denied:", err);
      alert("Please enable camera access to record video of your car.");
    }
  };

  const stopCamera = () => {
    if (previewStream) {
      previewStream.getTracks().forEach(track => track.stop());
      setPreviewStream(null);
    }
    setCameraActive(false);
  };

  const startRecording = () => {
    if (!previewStream) return;
    chunksRef.current = [];
    const mediaRecorder = new MediaRecorder(previewStream);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      setRecordedBlob(blob);
      onRecordingComplete(blob);
    };
    mediaRecorder.start();
    mediaRecorderRef.current = mediaRecorder;
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      stopCamera();
    }
  };

  const resetRecording = () => {
    setRecordedBlob(null);
    startCamera();
  };

  return (
    <div className="space-y-4">
      {!cameraActive && !recordedBlob && (
        <button 
          onClick={startCamera}
          title="Open camera to record video"
          className="group relative w-full h-24 bg-zinc-900 border-2 border-dashed border-white/10 rounded-xl flex items-center justify-center gap-4 hover:border-brand/50 transition-all overflow-hidden"
        >
          <div className="absolute inset-0 bg-brand/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <Camera className="w-6 h-6 text-zinc-500 group-hover:text-brand transition-colors" />
          <div className="text-left">
            <p className="font-black uppercase tracking-widest text-[10px] text-white italic">Record Video Evidence</p>
            <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mt-0.5">Capture sound or visual cues</p>
          </div>
        </button>
      )}

      {cameraActive && (
        <div className="relative bg-black rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
          <video ref={videoRef} autoPlay playsInline muted className="w-full aspect-video object-cover" />
          
          <div className="absolute inset-0 flex flex-col justify-between p-6 bg-gradient-to-t from-black/80 via-transparent to-black/40">
             <div className="flex justify-between items-start">
               <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                 <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
                 <span className="text-[10px] font-black uppercase tracking-widest text-white">
                   {isRecording ? 'Recording...' : 'Camera On'}
                 </span>
               </div>
               <button onClick={stopCamera} title="Close camera" className="p-2 bg-black/60 rounded-full text-white border border-white/10">
                 <Trash2 className="w-4 h-4" />
               </button>
             </div>

             <div className="flex items-center justify-center gap-6">
               {!isRecording ? (
                 <button 
                  onClick={startRecording}
                  title="Start Recording"
                  className="w-16 h-16 bg-white rounded-full flex items-center justify-center border-4 border-red-500/50 hover:scale-110 transition-transform shadow-[0_0_20px_rgba(239,68,68,0.4)]"
                 >
                   <div className="w-6 h-6 bg-red-600 rounded-sm shadow-inner" />
                 </button>
               ) : (
                 <button 
                  onClick={stopRecording}
                  title="Stop Recording"
                  className="w-16 h-16 bg-white rounded-full flex items-center justify-center border-4 border-black group hover:scale-110 transition-transform"
                 >
                   <div className="w-6 h-6 bg-black rounded-full" />
                 </button>
               )}
             </div>
          </div>
        </div>
      )}

      {recordedBlob && (
        <div className="space-y-4">
          <div className="relative group">
            <video 
              src={URL.createObjectURL(recordedBlob)} 
              controls 
              className="w-full rounded-2xl border border-white/10 bg-black aspect-video"
            />
            <button 
              onClick={resetRecording}
              title="Delete and record again"
              className="absolute top-4 right-4 p-3 bg-red-600 rounded-xl text-white shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-wider">Redo</span>
            </button>
          </div>
          <div className="bg-brand/10 border border-brand/20 p-4 rounded-xl flex items-center gap-3">
             <Check className="w-5 h-5 text-brand" />
             <p className="text-xs font-bold text-blue-100 italic">Video captured. Describe any other symptoms below then scan!</p>
          </div>
        </div>
      )}
    </div>
  );
};
