import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, Square, Settings as SettingsIcon, Upload, Download, Monitor, Video } from 'lucide-react';
import { AppSettings, NoteEvent, DEFAULT_THEME, ThemePalette } from './types';
import { parseMidi, generateMockNotes, generateThemeFromImage, drawPianoRoll, drawOscilloscope } from './utils';
import PianoRoll from './components/PianoRoll';
import Oscilloscope from './components/Oscilloscope';

const App: React.FC = () => {
  // State
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [sourceNode, setSourceNode] = useState<AudioBufferSourceNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  
  const [currentTime, setCurrentTime] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [startOffset, setStartOffset] = useState(0);
  
  const [notes, setNotes] = useState<NoteEvent[]>(generateMockNotes());
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null); // For drawing to canvas
  const [generatedTheme, setGeneratedTheme] = useState<ThemePalette>(DEFAULT_THEME);
  
  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recCanvasRef = useRef<HTMLCanvasElement>(null);
  const destNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  const [settings, setSettings] = useState<AppSettings>({
    title: 'T I N T I N N A B U L I',
    offsetMs: 0,
    themeMode: 'normal',
    scopeSensitivity: 1.5,
    aspectRatio: '16:9',
  });

  const [showSettings, setShowSettings] = useState(false);
  const reqIdRef = useRef<number | undefined>(undefined);
  const recReqIdRef = useRef<number | undefined>(undefined);

  // Derive active theme
  const activeTheme = useMemo(() => {
    return settings.themeMode === 'image' ? generatedTheme : DEFAULT_THEME;
  }, [settings.themeMode, generatedTheme]);

  // Init Audio Context
  useEffect(() => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ana = ctx.createAnalyser();
    ana.fftSize = 2048;
    setAudioContext(ctx);
    setAnalyser(ana);

    return () => {
      ctx.close();
    }
  }, []);

  // Playback Loop (Screen)
  const updateTime = () => {
    if (audioContext && isPlaying) {
      const now = audioContext.currentTime;
      const trackTime = (now - startTime) + startOffset;
      setCurrentTime(trackTime);
      reqIdRef.current = requestAnimationFrame(updateTime);
    }
  };

  useEffect(() => {
    if (isPlaying) {
      reqIdRef.current = requestAnimationFrame(updateTime);
    } else {
      if (reqIdRef.current) cancelAnimationFrame(reqIdRef.current);
    }
  }, [isPlaying]);

  // Load image object for canvas drawing
  useEffect(() => {
    if (imageSrc) {
      const img = new Image();
      img.src = imageSrc;
      img.onload = () => setLoadedImage(img);
    } else {
      setLoadedImage(null);
    }
  }, [imageSrc]);

  // Handlers
  const handlePlayPause = async () => {
    if (!audioContext) return;
    
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    if (isPlaying) {
      if (sourceNode) sourceNode.stop();
      if (isRecording) stopRecording(); // Stop recording if pause is hit
      setStartOffset(currentTime);
      setIsPlaying(false);
    } else {
      startPlayback();
    }
  };

  const startPlayback = () => {
    if (!audioContext || !analyser || !audioBuffer) return;

    const src = audioContext.createBufferSource();
    src.buffer = audioBuffer;
    
    // Connect to analyser
    src.connect(analyser);
    
    // If recording, connect to destNode as well/instead
    if (destNodeRef.current) {
        analyser.connect(destNodeRef.current);
        analyser.connect(audioContext.destination); // Also Monitor
    } else {
        analyser.connect(audioContext.destination);
    }
    
    src.start(0, startOffset);
    setSourceNode(src);
    setStartTime(audioContext.currentTime);
    setIsPlaying(true);
  };

  const handleStop = () => {
    if (sourceNode) {
        try { sourceNode.stop(); } catch(e) {}
    }
    if (isRecording) stopRecording();
    setIsPlaying(false);
    setStartOffset(0);
    setCurrentTime(0);
  };

  // --- RECORDING LOGIC ---

  const startRecording = async () => {
    if (!audioContext || !recCanvasRef.current || !analyser) return;

    // 1. Setup Stream Destination for Audio
    const dest = audioContext.createMediaStreamDestination();
    destNodeRef.current = dest;

    // 2. Setup Canvas Stream
    const canvasStream = recCanvasRef.current.captureStream(30); // 30 FPS

    // 3. Combine Tracks
    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...dest.stream.getAudioTracks()
    ]);

    // 4. Init MediaRecorder
    // Try to use common mime types
    let options = { mimeType: 'video/webm;codecs=vp9' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options = { mimeType: 'video/webm' };
    }

    const recorder = new MediaRecorder(combinedStream, options);
    
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        setRecordedChunks((prev) => [...prev, e.data]);
      }
    };

    recorder.onstop = () => {
      // Clean up destination connection to avoid duplicate audio on next play
      destNodeRef.current = null; 
      analyser.disconnect(); 
      // Reconnect analyser to speakers only for normal playback
      analyser.connect(audioContext.destination); 
    };

    mediaRecorderRef.current = recorder;
    setRecordedChunks([]); // Clear previous
    recorder.start();
    setIsRecording(true);

    // 5. Start Playback (if not already)
    if (!isPlaying) {
      startPlayback();
    }

    // 6. Start Recording Render Loop
    renderRecordingFrame();
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recReqIdRef.current) cancelAnimationFrame(recReqIdRef.current);
  };

  const downloadVideo = () => {
    if (recordedChunks.length === 0) return;
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    document.body.appendChild(a);
    a.style.display = 'none';
    a.href = url;
    a.download = `${settings.title.replace(/\s+/g, '_')}_visualizer.webm`;
    a.click();
    window.URL.revokeObjectURL(url);
    setRecordedChunks([]); // Reset after download
  };

  // The Composite Renderer for Recording
  const renderRecordingFrame = () => {
    if (!recCanvasRef.current || !analyser) return;
    const ctx = recCanvasRef.current.getContext('2d');
    if (!ctx) return;

    // Config
    const w = recCanvasRef.current.width;
    const h = recCanvasRef.current.height;
    const isLandscape = w > h;

    // Clear & BG
    ctx.fillStyle = activeTheme.background;
    ctx.fillRect(0, 0, w, h);

    // Get Data
    // Note: We need a fresh buffer for the recorder loop distinct from the UI loop
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    // Calc Time
    let renderTime = currentTime;
    if (audioContext && isPlaying) {
       renderTime = (audioContext.currentTime - startTime) + startOffset;
    }

    // --- DRAW LAYOUT (Mimic the Grid) ---
    
    if (isLandscape) {
      // 16:9
      // Piano: 0,0 2/3w, h
      // Scope: 2/3w, 0, 1/3w, h/2
      // Image: 2/3w, h/2, 1/3w, h/2
      
      const pianoW = (w / 3) * 2;
      const col2X = pianoW;
      const col2W = w / 3;
      
      // Save state and translate for Piano
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, pianoW, h);
      ctx.clip();
      ctx.translate(0, 0); // Origin
      drawPianoRoll(ctx, notes, renderTime + (settings.offsetMs/1000), activeTheme.tracks, activeTheme.background, pianoW, h);
      ctx.restore();

      // Scope
      ctx.save();
      ctx.beginPath();
      ctx.rect(col2X, 0, col2W, h/2);
      ctx.clip();
      ctx.translate(col2X, 0);
      drawOscilloscope(ctx, null, dataArray, true, activeTheme.scope, activeTheme.background, settings.scopeSensitivity, col2W, h/2);
      ctx.restore();

      // Image
      if (loadedImage) {
        // Draw Image (Cover fit)
        ctx.save();
        ctx.beginPath();
        ctx.rect(col2X, h/2, col2W, h/2);
        ctx.clip();
        // Simple cover fit logic
        const imgRatio = loadedImage.width / loadedImage.height;
        const targetRatio = col2W / (h/2);
        let dw = col2W;
        let dh = h/2;
        let dx = col2X;
        let dy = h/2;
        
        if (imgRatio > targetRatio) {
           dh = col2W / imgRatio;
           dy += ((h/2) - dh) / 2;
        } else {
           dw = (h/2) * imgRatio;
           dx += (col2W - dw) / 2;
        }
        ctx.drawImage(loadedImage, col2X, h/2, col2W, h/2); // Stretch for now for simplicity or implement cover
        ctx.restore();
      }

    } else {
      // 9:16
      // Top Row (35%): Image (Left), Scope (Right)
      // Bottom Row (65%): Piano
      const row1H = h * 0.35;
      const row2Y = row1H;
      const row2H = h - row1H;
      const colW = w / 2;

      // Image (Top Left)
      if (loadedImage) {
        ctx.drawImage(loadedImage, 0, 0, colW, row1H); 
      }

      // Scope (Top Right)
      ctx.save();
      ctx.beginPath();
      ctx.rect(colW, 0, colW, row1H);
      ctx.clip();
      ctx.translate(colW, 0);
      drawOscilloscope(ctx, null, dataArray, true, activeTheme.scope, activeTheme.background, settings.scopeSensitivity, colW, row1H);
      ctx.restore();

      // Piano (Bottom)
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, row2Y, w, row2H);
      ctx.clip();
      ctx.translate(0, row2Y);
      drawPianoRoll(ctx, notes, renderTime + (settings.offsetMs/1000), activeTheme.tracks, activeTheme.background, w, row2H);
      ctx.restore();
    }

    // Title Overlay
    ctx.font = 'italic 48px "Cormorant Garamond", serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = activeTheme.text;
    ctx.globalCompositeOperation = 'difference'; // Cool effect
    ctx.fillText(settings.title, w / 2, 80);
    ctx.globalCompositeOperation = 'source-over';

    recReqIdRef.current = requestAnimationFrame(renderRecordingFrame);
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && audioContext) {
      const arrayBuffer = await file.arrayBuffer();
      const decoded = await audioContext.decodeAudioData(arrayBuffer);
      setAudioBuffer(decoded);
      handleStop();
    }
  };

  const handleMidiUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const arrayBuffer = await file.arrayBuffer();
      const parsedNotes = parseMidi(arrayBuffer);
      setNotes(parsedNotes);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImageSrc(url);
      
      const newTheme = await generateThemeFromImage(url);
      setGeneratedTheme(newTheme);
      setSettings(prev => ({ ...prev, themeMode: 'image' }));
    }
  };

  const isLandscape = settings.aspectRatio === '16:9';
  const containerStyle: React.CSSProperties = isLandscape 
    ? { aspectRatio: '16/9', width: '100%', maxWidth: '100%', maxHeight: '100vh', backgroundColor: activeTheme.background }
    : { aspectRatio: '9/16', height: '100%', maxHeight: '100vh', maxWidth: '100%', backgroundColor: activeTheme.background };

  // UI Dims
  const dims = isLandscape 
    ? { piano: { w: 2560, h: 2160 }, scope: { w: 1280, h: 1080 }, image: { w: 1280, h: 1080 } } 
    : { piano: { w: 2160, h: 2500 }, scope: { w: 1080, h: 1300 }, image: { w: 1080, h: 1300 } };

  // Rec Dims (Full HD output)
  const recDims = isLandscape ? { w: 1920, h: 1080 } : { w: 1080, h: 1920 };

  return (
    <div 
      className="w-full h-screen flex items-center justify-center overflow-hidden transition-colors duration-700" 
      style={{ backgroundColor: activeTheme.background }}
    >
      
      {/* Hidden Master Canvas for Recording */}
      <canvas 
        ref={recCanvasRef} 
        width={recDims.w} 
        height={recDims.h} 
        className="hidden absolute -z-50"
      />

      {/* Settings Toggle */}
      <div className="absolute top-4 right-4 z-50">
         <button 
          onClick={() => setShowSettings(!showSettings)}
          className="p-3 backdrop-blur-md rounded-full transition-all border border-transparent hover:border-white/20"
          style={{ color: activeTheme.text, backgroundColor: 'rgba(255,255,255,0.1)' }}
         >
           <SettingsIcon size={24} />
         </button>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute top-16 right-4 z-50 w-80 bg-white/90 backdrop-blur-xl shadow-2xl p-6 rounded-lg border border-stone-200 overflow-y-auto max-h-[80vh] font-serif">
            <h2 className="text-xl italic mb-6 text-center border-b border-stone-300 pb-2">Réglages</h2>
            <div className="space-y-6">
              {/* Uploads */}
              <div className="space-y-2">
                 <label className="text-sm uppercase tracking-widest text-stone-500 block">Audio (mp3/wav)</label>
                 <input type="file" accept="audio/*" onChange={handleAudioUpload} className="text-xs w-full file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-stone-100 file:text-stone-700 hover:file:bg-stone-200"/>
              </div>
              <div className="space-y-2">
                 <label className="text-sm uppercase tracking-widest text-stone-500 block">Midi (.mid)</label>
                 <input type="file" accept=".mid,.midi" onChange={handleMidiUpload} className="text-xs w-full file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-stone-100 file:text-stone-700 hover:file:bg-stone-200"/>
              </div>
              <div className="space-y-2">
                 <label className="text-sm uppercase tracking-widest text-stone-500 block">Image</label>
                 <input type="file" accept="image/*" onChange={handleImageUpload} className="text-xs w-full file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-stone-100 file:text-stone-700 hover:file:bg-stone-200"/>
              </div>
              <hr className="border-stone-200"/>
              {/* Inputs */}
              <div>
                <label className="text-sm uppercase tracking-widest text-stone-500 block mb-1">Titre</label>
                <input 
                  type="text" 
                  value={settings.title} 
                  onChange={(e) => setSettings({...settings, title: e.target.value})}
                  className="w-full bg-transparent border-b border-stone-300 p-1 focus:outline-none font-serif text-lg text-center"
                />
              </div>
              <div>
                <label className="text-sm uppercase tracking-widest text-stone-500 block mb-1">Décalage (ms)</label>
                <input 
                  type="number" 
                  value={settings.offsetMs} 
                  onChange={(e) => setSettings({...settings, offsetMs: Number(e.target.value)})}
                  className="w-full bg-transparent border-b border-stone-300 p-1 focus:outline-none font-mono text-center"
                />
              </div>
              <div>
                 <label className="text-sm uppercase tracking-widest text-stone-500 block mb-2">Sensibilité Oscilloscope</label>
                 <input 
                  type="range" 
                  min="0.1" 
                  max="5" 
                  step="0.1" 
                  value={settings.scopeSensitivity}
                  onChange={(e) => setSettings({...settings, scopeSensitivity: parseFloat(e.target.value)})}
                  className="w-full accent-stone-800"
                 />
              </div>
              <div>
                <label className="text-sm uppercase tracking-widest text-stone-500 block mb-2">Thème</label>
                <div className="flex gap-2 p-1 bg-stone-100 rounded-lg">
                  <button onClick={() => setSettings({...settings, themeMode: 'normal'})} className={`flex-1 py-1 rounded-md text-sm transition-all ${settings.themeMode === 'normal' ? 'bg-white shadow-sm text-black' : 'text-stone-500'}`}>Normal</button>
                  <button onClick={() => setSettings({...settings, themeMode: 'image'})} className={`flex-1 py-1 rounded-md text-sm transition-all ${settings.themeMode === 'image' ? 'bg-white shadow-sm text-black' : 'text-stone-500'}`} disabled={!imageSrc}>Image</button>
                </div>
              </div>
              <div>
                <label className="text-sm uppercase tracking-widest text-stone-500 block mb-1">Format</label>
                <div className="flex gap-2">
                  <button onClick={() => setSettings({...settings, aspectRatio: '16:9'})} className={`flex-1 py-2 border ${settings.aspectRatio === '16:9' ? 'bg-stone-800 text-white' : 'border-stone-300'}`}>16:9</button>
                  <button onClick={() => setSettings({...settings, aspectRatio: '9:16'})} className={`flex-1 py-2 border ${settings.aspectRatio === '9:16' ? 'bg-stone-800 text-white' : 'border-stone-300'}`}>9:16</button>
                </div>
              </div>

              <div className="pt-4 flex justify-between items-center border-t border-stone-200">
                  <button onClick={handlePlayPause} className="p-2 hover:bg-stone-200 rounded-full transition-colors">
                     {isPlaying ? <Pause size={24}/> : <Play size={24}/>}
                  </button>
                  <button onClick={handleStop} className="p-2 hover:bg-stone-200 rounded-full transition-colors">
                     <Square size={20}/>
                  </button>
                  
                  {isRecording ? (
                    <button className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-full text-xs hover:bg-red-700 transition-colors animate-pulse" onClick={stopRecording}>
                       <Square size={12} fill="white"/> STOP REC
                    </button>
                  ) : (
                    <div className="flex gap-2">
                       <button className="flex items-center gap-2 px-4 py-2 bg-stone-800 text-white rounded-full text-xs hover:bg-black transition-colors" onClick={startRecording}>
                        <div className="w-2 h-2 rounded-full bg-red-500"></div> REC
                       </button>
                       {recordedChunks.length > 0 && (
                         <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-full text-xs hover:bg-blue-700 transition-colors" onClick={downloadVideo}>
                            <Download size={14} /> SAVE
                         </button>
                       )}
                    </div>
                  )}
              </div>
            </div>
        </div>
      )}

      {/* Main Preview */}
      <div 
        className="relative shadow-2xl overflow-hidden transition-all duration-700 ease-in-out"
        style={containerStyle}
      >
        <div className="absolute top-0 w-full text-center pt-8 z-10 pointer-events-none">
           <h1 className="font-serif text-4xl md:text-5xl tracking-[0.2em] mix-blend-difference opacity-80" style={{ color: activeTheme.text }}>
             {settings.title}
           </h1>
        </div>

        {isLandscape && (
          <div className="grid grid-cols-3 grid-rows-2 w-full h-full p-8 gap-4 pt-24">
            <div className="col-span-2 row-span-2 relative overflow-hidden rounded-sm">
               <PianoRoll 
                 notes={notes}
                 currentTime={currentTime + (settings.offsetMs/1000)}
                 palette={activeTheme.tracks}
                 backgroundColor={activeTheme.background}
                 width={dims.piano.w}
                 height={dims.piano.h}
               />
            </div>
            <div className="col-span-1 row-span-1 relative overflow-hidden rounded-sm">
                <Oscilloscope 
                   analyser={analyser}
                   isPlaying={isPlaying}
                   sensitivity={settings.scopeSensitivity}
                   color={activeTheme.scope}
                   backgroundColor={activeTheme.background}
                   width={dims.scope.w}
                   height={dims.scope.h}
                />
            </div>
            <div className="col-span-1 row-span-1 relative overflow-hidden flex items-center justify-center rounded-sm" style={{ backgroundColor: activeTheme.background }}>
               {imageSrc ? (
                 <img src={imageSrc} alt="Track Art" className="w-full h-full object-cover" />
               ) : (
                  <div className="opacity-20 font-serif text-2xl" style={{ color: activeTheme.text }}>Image</div>
               )}
            </div>
          </div>
        )}

        {!isLandscape && (
          <div className="flex flex-col w-full h-full p-6 gap-4 pt-24">
             <div className="flex flex-row h-[35%] gap-4">
                <div className="flex-1 relative overflow-hidden flex items-center justify-center rounded-sm" style={{ backgroundColor: activeTheme.background }}>
                    {imageSrc ? (
                      <img src={imageSrc} alt="Track Art" className="w-full h-full object-cover" />
                    ) : (
                        <div className="opacity-20 font-serif text-xl text-center" style={{ color: activeTheme.text }}>Image</div>
                    )}
                </div>
                <div className="flex-1 relative overflow-hidden rounded-sm">
                     <Oscilloscope 
                      analyser={analyser}
                      isPlaying={isPlaying}
                      sensitivity={settings.scopeSensitivity}
                      color={activeTheme.scope}
                      backgroundColor={activeTheme.background}
                      width={dims.scope.w}
                      height={dims.scope.h}
                    />
                </div>
             </div>
             <div className="flex-1 relative overflow-hidden rounded-sm">
                <PianoRoll 
                   notes={notes}
                   currentTime={currentTime + (settings.offsetMs/1000)}
                   palette={activeTheme.tracks}
                   backgroundColor={activeTheme.background}
                   width={dims.piano.w}
                   height={dims.piano.h}
                 />
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;