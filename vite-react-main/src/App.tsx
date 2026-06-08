import { useEffect, useMemo, useRef, useState } from "react";
import { onValue, ref, set } from "firebase/database";
import { db } from "./firebase";
import "./App.css";

type Cue = {
  speaker: string;
  text: string;
  audio?: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function App() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const role = (params.get("role") ?? "viewer").toLowerCase();
  const isController = role === "controller";

  const [idx, setIdx] = useState<number>(0);
  const [cues, setCues] = useState<Cue[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [playEnabled, setPlayEnabled] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const r = ref(db, "/shared/idx");
    const unsub = onValue(r, (snap) => {
      const v = snap.val();
      if (typeof v === "number" && Number.isFinite(v)) setIdx(v);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const r = ref(db, "/shared/play");
    const unsub = onValue(r, (snap) => {
      setPlayEnabled(!!snap.val());
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const r = ref(db, "/cues");
    const unsub = onValue(r, (snap) => {
      const v = snap.val();
      if (!v) { setCues([]); return; }
      const list: Cue[] = Object.keys(v).sort().map((k) => ({
        speaker: String(v[k]?.speaker ?? ""),
        text: String(v[k]?.text ?? ""),
        audio: String(v[k]?.audio ?? ""),
      })).filter((x) => x.speaker || x.text || x.audio);
      setCues(list);
    });
    return () => unsub();
  }, []);

  const max = Math.max(0, cues.length - 1);
  const safeIdx = clamp(idx, 0, max);
  const current = cues[safeIdx] ?? null;

  const move = (nextIdx: number) => {
    set(ref(db, "/shared/idx"), clamp(nextIdx, 0, max));
  };

  const onStart = () => set(ref(db, "/shared/play"), true);
  const onStop = () => set(ref(db, "/shared/play"), false);

  useEffect(() => {
    if (playEnabled) return;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [playEnabled]);

  useEffect(() => {
    if (!soundEnabled || !playEnabled) return;
    const url = current?.audio?.trim();
    if (!url) return;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    const a = new Audio(url);
    a.preload = "auto";
    audioRef.current = a;
    a.play().catch(() => {});
    return () => { try { a.pause(); a.currentTime = 0; } catch {} };
  }, [safeIdx, soundEnabled, playEnabled, current?.audio]);

  if (!soundEnabled) {
    return (
      <div className="tap-screen" onClick={() => setSoundEnabled(true)}>
        <div className="tap-castle">🏯</div>
        <div className="tap-title">Osaka Castle Tour</div>
        <div className="tap-btn">Tap to Start</div>
        <div className="tap-sub">※ iPhone / Safari の仕様です</div>
      </div>
    );
  }

  return (
    <div className={`app ${isController ? "is-controller" : "is-viewer"}`}>
      <div className="header">
        <span className="header-icon">🏯</span>
        <span className="header-title">Osaka Castle Tour</span>
        <span className="header-role">{isController ? "GUIDE" : "GUEST"}</span>
      </div>

      <div className="card-area">
        {current ? (
          <div className={`card ${playEnabled ? "active" : "paused"}`}>
            <div className="card-num">{safeIdx + 1} / {cues.length}</div>
            <div className="card-speaker">{current.speaker}</div>
            <div className="card-text">{current.text}</div>
            {current.audio && playEnabled && (
              <div className="card-audio-indicator">♪ Playing</div>
            )}
          </div>
        ) : (
          <div className="card empty">
            <div className="card-text">Loading...</div>
          </div>
        )}
      </div>

      {isController && (
        <div className="controls">
          <div className="play-controls">
            <button
              className={`btn-play ${playEnabled ? "on" : "off"}`}
              onClick={playEnabled ? onStop : onStart}
            >
              {playEnabled ? "■ STOP" : "▶ START"}
            </button>
          </div>
          <div className="nav-controls">
            <button className="btn-nav" onClick={() => move(safeIdx - 1)} disabled={safeIdx === 0}>
              ◀ Prev
            </button>
            <div className="nav-idx">{safeIdx + 1} / {cues.length}</div>
            <button className="btn-nav" onClick={() => move(safeIdx + 1)} disabled={safeIdx === max}>
              Next ▶
            </button>
          </div>
          <button className="btn-reset" onClick={() => move(0)}>↺ Reset</button>
        </div>
      )}

      {!isController && (
        <div className="viewer-status">
          {playEnabled ? (
            <span className="status-live">● LIVE</span>
          ) : (
            <span className="status-wait">⏸ Waiting for guide...</span>
          )}
        </div>
      )}
    </div>
  );
}
