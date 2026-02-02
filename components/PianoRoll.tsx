import React, { useRef, useEffect } from 'react';
import { NoteEvent } from '../types';
import { drawPianoRoll } from '../utils';

interface PianoRollProps {
  notes: NoteEvent[];
  currentTime: number;
  palette: string[]; // Array of track colors
  backgroundColor: string;
  width: number;
  height: number;
}

const PianoRoll: React.FC<PianoRollProps> = ({ 
  notes, 
  currentTime, 
  palette,
  backgroundColor,
  width,
  height
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    // Use pure drawing function
    drawPianoRoll(ctx, notes, currentTime, palette, backgroundColor, width, height);

  }, [notes, currentTime, palette, backgroundColor, width, height]);

  return <canvas ref={canvasRef} className="block w-full h-full object-contain" />;
};

export default PianoRoll;