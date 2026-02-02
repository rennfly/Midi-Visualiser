import { NoteEvent, ThemePalette, DEFAULT_THEME } from './types';
import { Midi } from '@tonejs/midi';

// Real MIDI Parser using @tonejs/midi
export const parseMidi = (arrayBuffer: ArrayBuffer): NoteEvent[] => {
  try {
    const midi = new Midi(arrayBuffer);
    const allNotes: NoteEvent[] = [];

    midi.tracks.forEach((track, trackIndex) => {
      track.notes.forEach(note => {
        // @ts-ignore
        const noteChannel = note.channel;
        const trackChannel = track.channel;
        
        allNotes.push({
          note: note.midi,             
          velocity: note.velocity * 127,
          startTime: note.time,        
          duration: note.duration,     
          track: trackIndex,           
          channel: (typeof noteChannel === 'number') ? noteChannel : (trackChannel || 0)
        });
      });
    });
    
    return allNotes.sort((a, b) => a.startTime - b.startTime);
  } catch (error) {
    console.error("Failed to parse MIDI:", error);
    return generateMockNotes();
  }
};

// Generate Mock Data
export const generateMockNotes = (): NoteEvent[] => {
  const notes: NoteEvent[] = [];
  let time = 0;
  for (let i = 0; i < 200; i++) {
    const isMelody = Math.random() > 0.4;
    if (isMelody) {
       notes.push({
        note: 70 + Math.floor(Math.random() * 20),
        velocity: 90,
        startTime: time,
        duration: 0.2 + Math.random() * 0.5,
        track: 1,
        channel: 1
      });
    } else {
      notes.push({
        note: 40 + Math.floor(Math.random() * 12),
        velocity: 70,
        startTime: time,
        duration: 0.8,
        track: 0,
        channel: 0
      });
    }
    time += 0.2 + Math.random() * 0.4;
  }
  return notes;
};

// --- DRAWING FUNCTIONS (Pure) ---

export const drawPianoRoll = (
  ctx: CanvasRenderingContext2D,
  notes: NoteEvent[],
  currentTime: number,
  palette: string[],
  backgroundColor: string,
  width: number,
  height: number
) => {
  ctx.save();
  
  // Clear background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  const isDarkBg = parseInt(backgroundColor.replace('#', ''), 16) < 0xffffff / 2;

  // Config
  const TIME_WINDOW = 10; 
  const PX_PER_SEC = width / TIME_WINDOW;
  const MIN_NOTE = 21; 
  const MAX_NOTE = 108;
  const TOTAL_KEYS = MAX_NOTE - MIN_NOTE + 1; 
  const NOTE_HEIGHT = height / TOTAL_KEYS;
  const PLAYHEAD_X = width * 0.25;
  
  // Playhead line
  ctx.beginPath();
  ctx.moveTo(PLAYHEAD_X, 0);
  ctx.lineTo(PLAYHEAD_X, height);
  ctx.lineWidth = 1; 
  ctx.strokeStyle = isDarkBg ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  ctx.stroke();

  // Notes
  notes.forEach(n => {
    const relativeTime = n.startTime - currentTime;
    const x = PLAYHEAD_X + (relativeTime * PX_PER_SEC);
    const w = Math.max(n.duration * PX_PER_SEC, 3);
    const noteIndex = n.note - MIN_NOTE;
    const y = height - (noteIndex * NOTE_HEIGHT) - NOTE_HEIGHT;

    // Visibility Check
    if (x + w > -100 && x < width + 100) {
      
      const discriminator = (n.track || 0) + (n.channel || 0);
      const colorIdx = discriminator % palette.length;
      const fillStyle = palette[colorIdx];
      const isActive = currentTime >= n.startTime && currentTime <= (n.startTime + n.duration);

      if (isActive) {
         // Active
         ctx.shadowBlur = 15;
         ctx.shadowColor = fillStyle;
         ctx.fillStyle = isDarkBg ? '#ffffff' : fillStyle;
         
         if (ctx.roundRect) {
              ctx.beginPath();
              ctx.roundRect(x - 1, y - 1, w + 2, NOTE_HEIGHT * 0.85 + 2, 4);
              ctx.fill();
          } else {
              ctx.fillRect(x - 1, y - 1, w + 2, NOTE_HEIGHT * 0.85 + 2);
          }
          ctx.shadowBlur = 0;
      } else {
         // Passive
         ctx.fillStyle = fillStyle;
         ctx.globalAlpha = 0.9; 
         ctx.shadowBlur = 4;
         ctx.shadowColor = isDarkBg ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.1)';
         ctx.shadowOffsetX = 2;
         ctx.shadowOffsetY = 2;

         if (ctx.roundRect) {
              ctx.beginPath();
              ctx.roundRect(x, y, w, NOTE_HEIGHT * 0.85, 3);
              ctx.fill();
          } else {
              ctx.fillRect(x, y, w, NOTE_HEIGHT * 0.85);
          }

          ctx.globalAlpha = 1.0;
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
      }
    }
  });
  
  ctx.restore();
};

export const drawOscilloscope = (
  ctx: CanvasRenderingContext2D,
  analyser: AnalyserNode | null,
  dataArray: Uint8Array,
  isPlaying: boolean,
  color: string,
  backgroundColor: string,
  sensitivity: number,
  width: number,
  height: number
) => {
  ctx.save();
  
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.beginPath();

  if (!analyser || !isPlaying) {
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Note: We assume getByteTimeDomainData is called outside or we call it here if needed.
  // Ideally, for pure function, data should be passed in. 
  // But if passed array is empty/stale, we might need to fetch. 
  // However, pure functions shouldn't mutate external state ideally.
  // We will assume dataArray is populated by the caller.

  const bufferLength = dataArray.length;
  if (bufferLength === 0) {
      ctx.restore();
      return;
  }

  const sliceWidth = width * 1.0 / bufferLength;
  let x = 0;

  for (let i = 0; i < bufferLength; i++) {
    const deviation = dataArray[i] - 128;
    const scaledDeviation = deviation * sensitivity;
    const finalY = (height / 2) + scaledDeviation;

    if (i === 0) {
      ctx.moveTo(x, finalY);
    } else {
      ctx.lineTo(x, finalY);
    }
    x += sliceWidth;
  }

  ctx.lineTo(width, height / 2);
  ctx.stroke();
  ctx.restore();
};

// --- Theme Generation Logic ---

const getPixelData = (imgSrc: string): Promise<Uint8ClampedArray> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject('No context'); return; }
      canvas.width = 50; 
      canvas.height = 50;
      ctx.drawImage(img, 0, 0, 50, 50);
      resolve(ctx.getImageData(0, 0, 50, 50).data);
    };
    img.onerror = reject;
    img.src = imgSrc;
  });
};

const rgbToHex = (r: number, g: number, b: number) => 
  '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');

const getLuminance = (r: number, g: number, b: number) => {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const generateThemeFromImage = async (imgSrc: string | null): Promise<ThemePalette> => {
  if (!imgSrc) return DEFAULT_THEME;

  try {
    const data = await getPixelData(imgSrc);
    const colorCounts: { [key: string]: number } = {};
    let maxCount = 0;
    let dominantColor = { r: 0, g: 0, b: 0 };

    for (let i = 0; i < data.length; i += 4) {
      const r = Math.round(data[i] / 10) * 10;
      const g = Math.round(data[i + 1] / 10) * 10;
      const b = Math.round(data[i + 2] / 10) * 10;
      const key = `${r},${g},${b}`;
      
      colorCounts[key] = (colorCounts[key] || 0) + 1;
      
      if (colorCounts[key] > maxCount) {
        maxCount = colorCounts[key];
        dominantColor = { r: data[i], g: data[i+1], b: data[i+2] };
      }
    }

    const bgHex = rgbToHex(dominantColor.r, dominantColor.g, dominantColor.b);
    const bgLum = getLuminance(dominantColor.r, dominantColor.g, dominantColor.b);
    const isDarkBg = bgLum < 128;

    const potentialColors: {r:number, g:number, b:number, dist: number}[] = [];

    for (let i = 0; i < data.length; i += 40) { 
      const r = data[i];
      const g = data[i+1];
      const b = data[i+2];
      
      const dist = Math.sqrt(
        Math.pow(r - dominantColor.r, 2) + 
        Math.pow(g - dominantColor.g, 2) + 
        Math.pow(b - dominantColor.b, 2)
      );

      if (dist > 50) { 
        potentialColors.push({ r, g, b, dist });
      }
    }

    potentialColors.sort((a, b) => b.dist - a.dist);

    const tracks: string[] = [];
    const fallbackColor = isDarkBg ? '#ffffff' : '#000000';
    
    if (potentialColors.length === 0) {
        tracks.push(fallbackColor, isDarkBg ? '#cccccc' : '#333333');
    } else {
        potentialColors.forEach(c => {
             if (tracks.length < 5) {
                 const hex = rgbToHex(c.r, c.g, c.b);
                 if (!tracks.includes(hex)) tracks.push(hex);
             }
        });
        if (tracks.length < 2) tracks.push(fallbackColor);
    }

    return {
      background: bgHex,
      scope: tracks[0],
      text: tracks[0],
      tracks: tracks
    };

  } catch (e) {
    console.warn("Could not extract colors", e);
    return DEFAULT_THEME;
  }
};