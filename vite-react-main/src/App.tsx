import { useEffect, useMemo, useRef, useState } from "react";
import { onValue, ref, set } from "firebase/database";
import { db } from "./firebase";
import "./App.css";

const PANELS = [
  { image: "/大阪城ツアー総合_1.jpg",  audio: "/大阪城ツアー１.mp3" },
  { image: "/大阪城ツアー総合_2.jpg",  audio: "/大阪城ツアー２.mp3" },
  { image: "/大阪城ツアー総合_3.jpg",  audio: "/大阪城ツアー３.mp3" },
  { image: "/大阪城ツアー総合_4.jpg",  audio: "/大阪城ツアー４.mp3" },
  { image: "/大阪城ツアー総合_5.jpg",  audio: "/大阪城ツアー５.mp3" },
  { image: "/大阪城ツアー総合_6.jpg",  audio: "/大阪城ツアー６.mp3" },
  { image: "/大阪城ツアー総合_7.jpg",  audio: "/大阪城ツアー７.mp3" },
  { image: "/大阪城ツアー総合_8.jpg",  audio: "/大阪城ツアー８.mp3" },
  { image: "/大阪城ツアー総合_9.jpg",  audio: "/大阪城ツアー９.mp3" },
  { image: "/大阪城ツアー総合_10.jpg", audio: "/大阪城ツアー１０.mp3" },
];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function App() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const role = (params.get("role") ?? "viewer").toLowerCase();
  const isController = role === "controller";

  const [idx, setIdx] = useState<number>(0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [playEnabled, setPlayEnabled] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const max = PANELS.length - 1;
  const safeIdx = clamp(idx, 0, max);
  const current = PANELS[safeIdx];

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
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    const a = new Audio(current.audio);
    a.preload = "auto";
    audioRef.current = a;
    a.play().catch(() => {});
    return () => { try { a.pause(); a.currentTime = 0; } catch {} };
  }, [safeIdx, soundEnabled, playEnabled, current.audio]);

  if (!soundEnabled) {
    return (
      <div className="tap-screen" onClick={() => setSoundEnabled(true)}>
        <div className="tap-castle">🏯</div>
        <div className="tap-title">Osaka Castle Tour</div>
        <div className="tap-subtitle">1615 The Summer Siege of Osaka</div>
        <div className="tap-btn">Tap to Start</div>
        <div className="tap-sub">※ iPhone / Safari の仕様です</div>
      </div>
    );
  }

  return (
    <div className={`app ${isController ? "is-controller" : "is-viewer"}`}>
      {!isController && (
        <div className="viewer-wrap">
          <img className="panel-img" src={current.image} alt={`Panel ${safeIdx + 1}`} />
          <div className="viewer-num">{safeIdx + 1} / {PANELS.length}</div>
          <div className="viewer-status-bar">
            {playEnabled
              ? <span className="status-live">● LIVE</span>
              : <span className="status-wait">⏸ Waiting for guide...</span>
            }
          </div>
        </div>
      )}
      {isController && (
        <div className="controller-wrap">
          <div className="ctrl-header">
            <span>🏯 Osaka Castle Tour</span>
            <span className="ctrl-role">GUIDE</span>
          </div>
          <div className="ctrl-preview">
            <img className="ctrl-img" src={current.image} alt={`Panel ${safeIdx + 1}`} />
            <div className="ctrl-num">{safeIdx + 1} / {PANELS.length}</div>
          </div>
          <div className="ctrl-controls">
            <button
              className={`btn-play ${playEnabled ? "on" : "off"}`}
              onClick={playEnabled ? onStop : onStart}
            >
              {playEnabled ? "■ STOP" : "▶ START"}
            </button>
            <div className="nav-row">
              <button className="btn-nav" onClick={() => move(safeIdx - 1)} disabled={safeIdx === 0}>
                ◀ Prev
              </button>
              <div className="nav-idx">{safeIdx + 1} / {PANELS.length}</div>
              <button className="btn-nav" onClick={() => move(safeIdx + 1)} disabled={safeIdx === max}>
                Next ▶
              </button>
            </div>
            <button className="btn-reset" onClick={() => move(0)}>↺ Reset</button>
          </div>
        </div>
      )}
    </div>
  );
}
