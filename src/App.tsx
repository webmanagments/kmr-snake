import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { setSoundEnabled, sfx, unlockAudio } from "./game/audio";
import { startSync } from "./lib/board";
import { useProfile } from "./lib/profile";
import { useSave } from "./lib/save";
import {
  focusDefault,
  focusEl,
  focusIsLost,
  installSpatialNav,
} from "./lib/spatial";
import Board from "./ui/Board";
import Home from "./ui/Home";
import NameSetup from "./ui/NameSetup";
import Play from "./ui/Play";
import Skins from "./ui/Skins";

export type Screen = "home" | "play" | "skins" | "board";
export type Go = (s: Screen) => void;

/** A screen can handle Back itself (pause a run, close a popup). Return true if handled. */
export const backHandler: { current: (() => boolean) | null } = {
  current: null,
};

// While one screen swaps for the next, focus rests on the app root so it's never left on
// <body>; each screen then moves it to its main control.
const appRoot: { current: HTMLDivElement | null } = { current: null };
export function parkFocus() {
  appRoot.current?.focus({ preventScroll: true });
}

function settleFocus(apply: () => void) {
  requestAnimationFrame(apply);
  for (const ms of [160, 450]) setTimeout(() => focusIsLost() && apply(), ms);
}

function push(s: Screen, replace = false) {
  try {
    if (replace) history.replaceState({ s }, "");
    else history.pushState({ s }, "");
  } catch {
    /* history can be locked down in some web views */
  }
}

startSync();

export default function App() {
  const s = useSave();
  const p = useProfile();
  const [screen, setScreen] = useState<Screen>("home");
  const [runKey, setRunKey] = useState(0);
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const lastButton = useRef<string | null>(null);

  useEffect(() => setSoundEnabled(s.sound), [s.sound]);

  useEffect(() => {
    const uninstall = installSpatialNav(() => {
      if (backHandler.current?.()) return;
      if (screenRef.current !== "home") {
        sfx.back();
        parkFocus();
        history.back();
      } else if (focusIsLost()) focusDefault();
    });
    push("home", true);
    const onPop = (e: PopStateEvent) => {
      const next = ((e.state as { s?: Screen } | null)?.s ?? "home") as Screen;
      // The glasses' own Back during a run pauses instead of leaving (or closes a popup).
      if (next !== screenRef.current && backHandler.current?.()) {
        push(screenRef.current);
        return;
      }
      if (next !== screenRef.current) parkFocus();
      setScreen(next);
    };
    window.addEventListener("popstate", onPop);
    const onKey = (e: KeyboardEvent) => {
      unlockAudio();
      if (screenRef.current !== "play" && /^Arrow/.test(e.key)) sfx.move();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", unlockAudio, true);
    document.addEventListener("click", unlockAudio, true);
    return () => {
      uninstall();
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", unlockAudio, true);
      document.removeEventListener("click", unlockAudio, true);
    };
  }, []);

  const go = useCallback<Go>((next) => {
    if (next === screenRef.current && next !== "play") return;
    if (screenRef.current === "home")
      lastButton.current =
        (document.activeElement as HTMLElement | null)?.dataset.nav ?? null;
    parkFocus();
    if (next === "play") setRunKey((k) => k + 1);
    if (next === "home") {
      history.back();
      return;
    }
    // Home → a screen adds a history step; screen → screen swaps it, so Back always lands Home.
    push(next, screenRef.current !== "home");
    setScreen(next);
  }, []);

  // Focus: land on each screen's main control; coming home, return to the button used.
  const prev = useRef<Screen>(screen);
  useLayoutEffect(() => {
    const before = prev.current;
    prev.current = screen;
    if (screen === "home" && before !== "home" && lastButton.current) {
      const id = lastButton.current;
      settleFocus(
        () =>
          focusEl(document.querySelector<HTMLElement>(`[data-nav="${id}"]`)) ||
          focusDefault(),
      );
    } else if (screen !== "play") settleFocus(() => focusDefault());
  }, [screen]);

  useEffect(() => {
    settleFocus(() => focusDefault());
  }, [p.name]);

  return (
    <div className="app" ref={appRoot} tabIndex={-1} data-focus-root>
      {!p.name ? (
        <NameSetup />
      ) : (
        <>
          {screen === "home" && <Home go={go} />}
          {screen === "play" && (
            <Play
              key={runKey}
              go={go}
              restart={() => setRunKey((k) => k + 1)}
            />
          )}
          {screen === "skins" && <Skins />}
          {screen === "board" && <Board />}
        </>
      )}
    </div>
  );
}
