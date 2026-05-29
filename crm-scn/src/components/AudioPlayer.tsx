'use client'
import React, { useState, useRef, useEffect, useCallback } from 'react'

const N_BARS = 60

function fmt(s: number) {
  if (!isFinite(s) || s < 0) return '0:00'
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

interface Props {
  url: string
  title?: string
}

export default function AudioPlayer({ url, title }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const stateRef = useRef({ playing: false, current: 0, duration: 0 })
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [hover, setHover] = useState(false)

  const draw = useCallback((ts: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = canvas.width
    const H = canvas.height
    ctx.clearRect(0, 0, W, H)

    const gap = 3
    const bw = (W - gap * (N_BARS - 1)) / N_BARS
    const analyser = analyserRef.current
    const { playing: isPlaying, current: cur, duration: dur } = stateRef.current

    let freqData: Uint8Array<ArrayBuffer> | null = null
    if (analyser && isPlaying) {
      freqData = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>
      analyser.getByteFrequencyData(freqData)
    }

    const progress = dur > 0 ? cur / dur : 0

    for (let i = 0; i < N_BARS; i++) {
      let val: number

      if (freqData) {
        const idx = Math.floor(i * freqData.length / N_BARS)
        val = Math.pow(freqData[idx] / 255, 0.7)
        val = Math.max(0.05, val)
      } else {
        const t = ts / 700
        val = 0.22
          + Math.sin(t * 2.9 + i * 0.39) * 0.14
          + Math.sin(t * 5.3 + i * 0.72) * 0.09
          + Math.sin(t * 1.7 + i * 0.21) * 0.07
          + Math.sin(t * 8.1 + i * 1.10) * 0.04
        val = Math.max(0.04, Math.min(0.96, val))
      }

      const barH = Math.max(4, val * H * 0.88)
      const x = i * (bw + gap)
      const y = (H - barH) / 2
      const isPlayed = dur > 0 && (i / N_BARS) <= progress

      if (isPlayed) {
        const g = ctx.createLinearGradient(0, y, 0, y + barH)
        g.addColorStop(0, '#FF5555')
        g.addColorStop(0.5, '#E8001C')
        g.addColorStop(1, '#FF5555')
        ctx.fillStyle = g
      } else {
        ctx.fillStyle = isPlaying ? '#374151' : '#2D3748'
      }

      roundRect(ctx, x, y, bw, barH, 2.5)
      ctx.fill()

      // Glow on played bars
      if (isPlayed) {
        ctx.shadowColor = '#E8001C'
        ctx.shadowBlur = 6
        roundRect(ctx, x, y, bw, barH, 2.5)
        ctx.fill()
        ctx.shadowBlur = 0
      }
    }

    rafRef.current = requestAnimationFrame(draw)
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime = () => { stateRef.current.current = audio.currentTime; setCurrent(audio.currentTime) }
    const onMeta = () => { stateRef.current.duration = audio.duration; setDuration(audio.duration) }
    const onEnded = () => { stateRef.current.playing = false; setPlaying(false) }
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('ended', onEnded)
    rafRef.current = requestAnimationFrame(draw)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('ended', onEnded)
      cancelAnimationFrame(rafRef.current)
    }
  }, [draw])

  const togglePlay = async () => {
    const audio = audioRef.current
    if (!audio) return
    if (!analyserRef.current) {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
        const actx = new AudioCtx()
        const analyser = actx.createAnalyser()
        analyser.fftSize = 256
        const source = actx.createMediaElementSource(audio)
        source.connect(analyser)
        analyser.connect(actx.destination)
        analyserRef.current = analyser
      } catch { /* fallback to animated bars */ }
    }
    if (playing) {
      audio.pause()
      stateRef.current.playing = false
      setPlaying(false)
    } else {
      await audio.play()
      stateRef.current.playing = true
      setPlaying(true)
    }
  }

  const seek = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const audio = audioRef.current
    if (!canvas || !audio || !duration) return
    const rect = canvas.getBoundingClientRect()
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * duration
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
      borderRadius: 16,
      padding: '16px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    }}>
      <audio ref={audioRef} src={url} preload="metadata" crossOrigin="anonymous" />

      {title && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13 }}>🎙️</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Play/Pause */}
        <button
          onClick={togglePlay}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            width: 48, height: 48, borderRadius: '50%', border: 'none',
            background: hover
              ? 'linear-gradient(135deg, #FF4D4D, #CC0016)'
              : 'linear-gradient(135deg, #E8001C, #FF3333)',
            color: '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            boxShadow: playing ? '0 0 20px rgba(232,0,28,0.6)' : '0 4px 14px rgba(232,0,28,0.4)',
            transition: 'all .15s',
            transform: hover ? 'scale(1.06)' : 'scale(1)',
            fontSize: 16,
          }}
        >
          {playing
            ? <span style={{ display: 'flex', gap: 3 }}><span style={{ width: 4, height: 16, background: '#fff', borderRadius: 2, display: 'block' }} /><span style={{ width: 4, height: 16, background: '#fff', borderRadius: 2, display: 'block' }} /></span>
            : <span style={{ marginLeft: 3, fontSize: 18 }}>▶</span>
          }
        </button>

        {/* Waveform canvas */}
        <canvas
          ref={canvasRef}
          width={900}
          height={80}
          onClick={seek}
          style={{ flex: 1, height: 56, cursor: 'pointer', borderRadius: 8 }}
        />

        {/* Time */}
        <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 68 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#F1F5F9', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em' }}>{fmt(current)}</div>
          <div style={{ fontSize: 10, color: '#475569', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{fmt(duration)}</div>
        </div>
      </div>
    </div>
  )
}
