import { useEffect, useMemo, useRef, useState } from "react";
import { onValue, ref, set } from "firebase/database";
import { db } from "./firebase";
import "./App.css";

type Cue = {
  speaker: string;
  text: string;
  audio?: string; // Firebase Storage の Download URL
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function App() {
  // ---- URL params ----
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const role = (params.get("role") ?? "viewer").toLowerCase(); // viewer | controller
  const isController = role === "controller";
  const debug = params.get("debug") === "1";

  // ---- state ----
  const [idx, setIdx] = useState<number>(0);
  const [cues, setCues] = useState<Cue[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(false);

  // ★ START/STOP（本番用ホールド）
  const [playEnabled, setPlayEnabled] = useState(false);

  // ---- audio control ----
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ---- Firebase: idx (進行) ----
  useEffect(() => {
    const r = ref(db, "/shared/idx");
    const unsub = onValue(r, (snap) => {
      const v = snap.val();
      if (typeof v === "number" && Number.isFinite(v)) setIdx(v);
      if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) {
        setIdx(Number(v));
      }
    });
    return () => unsub();
  }, []);

  // ---- Firebase: play (START/STOP) ----
  useEffect(() => {
    const r = ref(db, "/shared/play");
    const unsub = onValue(r, (snap) => {
      setPlayEnabled(!!snap.val());
    });
    return () => unsub();
  }, []);

  // ---- Firebase: cues (台本) ----
  useEffect(() => {
    const r = ref(db, "/cues");
    const unsub = onValue(r, (snap) => {
      const v = snap.val();
      if (!v) {
        setCues([]);
        return;
      }

      // 000, 010, 020... のようなキーを想定して並べ替え
      const list: Cue[] = Object.keys(v)
        .sort()
        .map((k) => ({
          speaker: String(v[k]?.speaker ?? ""),
          text: String(v[k]?.text ?? ""),
          audio: String(v[k]?.audio ?? ""),
        }))
        .filter((x) => x.speaker || x.text || x.audio);

      setCues(list);
    });
    return () => unsub();
  }, []);

  // ---- current / prev ----
  const max = Math.max(0, cues.length - 1);
  const safeIdx = clamp(idx, 0, max);

  const prev2 = safeIdx - 2 >= 0 ? cues[safeIdx - 2] : null;
  const prev1 = safeIdx - 1 >= 0 ? cues[safeIdx - 1] : null;
  const current = cues[safeIdx] ?? null;

  // ---- controller actions ----
  const move = (nextIdx: number) => {
    const next = clamp(nextIdx, 0, max);
    set(ref(db, "/shared/idx"), next);
  };

  const onPrev = () => move(safeIdx - 1);
  const onNext = () => move(safeIdx + 1);
  const onReset = () => move(0);

  const onStart = () => set(ref(db, "/shared/play"), true);
  const onStop = () => set(ref(db, "/shared/play"), false);

  // ---- STOP 押したら即停止 ----
  useEffect(() => {
    if (playEnabled) return;
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    } catch {
      // ignore
    }
  }, [playEnabled]);

  // ---- 音声：Tap後 + START後のみ、idx変化で再生 ----
  useEffect(() => {
    if (!soundEnabled) return;
    if (!playEnabled) return;

    const url = current?.audio?.trim();
    if (!url) return;

    // 前の音を止める
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    } catch {
      // ignore
    }

    const a = new Audio(url);
    a.preload = "auto";
    audioRef.current = a;

    a.play().catch((e) => {
      console.log("audio play blocked:", e);
    });

    return () => {
      try {
        a.pause();
        a.currentTime = 0;
      } catch {
        // ignore
      }
    };
  }, [safeIdx, soundEnabled, playEnabled, current?.audio]);

  // ---- soundEnabled OFFで止める ----
  useEffect(() => {
    if (soundEnabled) return;
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    } catch {
      // ignore
    }
  }, [soundEnabled]);

  // ---- UI ----
  return (
    <>
      {/* debug（普段は出さない） */}
      {debug && (
        <div className="debug">
          role: {role}
          <br />
          idx: {safeIdx}/{Math.max(1, cues.length)} (max {max})
          <br />
          play: {playEnabled ? "ON" : "OFF"} / sound:{" "}
          {soundEnabled ? "enabled" : "locked"}
          <br />
          audio: {current?.audio ? "yes" : "no"}
        </div>
      )}

      {/* iPhone/Safari 対策：ユーザー操作がないと音が出ない */}
      {!soundEnabled && (
        <div className="tap" onClick={() => setSoundEnabled(true)}>
          Tap to enable sound
          <div className="tap-sub">※ iPhone / Safari の仕様です</div>
        </div>
      )}

      <div className={`stage ${isController ? "controller" : "viewer"}`}>
        {/* 前の前：もっと薄っすら */}
        {prev2 && (
          <div className="line prev2">
            <div className="speaker">{prev2.speaker}</div>
            <div className="text">{prev2.text}</div>
          </div>
        )}

        {/* 前：うっすら */}
        {prev1 && (
          <div className="line prev1">
            <div className="speaker">{prev1.speaker}</div>
            <div className="text">{prev1.text}</div>
          </div>
        )}

        {/* 現在：くっきり */}
        {current && (
          <div className="line current">
            <div className="speaker">{current.speaker}</div>
            <div className="text">{current.text}</div>
          </div>
        )}
      </div>

      {/* controller のみ操作ボタン */}
      {isController && (
        <div className="controls">
          {/* ★START/STOP（本番用） */}
          <button className="btn" onClick={onStart}>
            ▶ START
          </button>
          <button className="btn ghost" onClick={onStop}>
            ■ STOP
          </button>

          <button className="btn" onClick={onPrev}>
            ◀ Prev
          </button>
          <button className="btn" onClick={onNext}>
            Next ▶
          </button>

          <div className="idxbox">
            <div className="idxlabel">idx</div>
            <input
              className="idxinput"
              type="number"
              value={safeIdx}
              min={0}
              max={max}
              onChange={(e) => move(Number(e.target.value))}
            />
            <div className="idxmax">/ {max}</div>
          </div>

          <button className="btn ghost" onClick={onReset}>
            Reset
          </button>
        </div>
      )}
    </>
  );
}
