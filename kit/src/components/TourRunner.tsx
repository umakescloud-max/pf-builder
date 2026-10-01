import { useEffect, useRef } from "react";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useLocation, useNavigate } from "react-router-dom";

export interface TourStep {
  id: string;
  route: string;
  target: string;
  title: string;
  body: string;
}

export interface TourRunnerProps {
  steps: TourStep[];
  storageKey: string;
}

/**
 * Wraps driver.js and drives cross-screen navigation: a step whose route
 * differs from the one before it triggers a react-router navigation, then
 * waits a tick for the new screen's DOM before advancing the highlight.
 * Auto-runs once per browser (localStorage flag); always offers replay.
 */
export function TourRunner({ steps, storageKey }: TourRunnerProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const driverRef = useRef<Driver | null>(null);

  function start() {
    if (steps.length === 0) return;

    const driverObj = driver({
      showProgress: true,
      allowClose: true,
      steps: steps.map((step, i) => ({
        element: `[data-tour="${step.target}"]`,
        popover: {
          title: step.title,
          description: step.body,
          onNextClick: () => {
            const next = steps[i + 1];
            if (!next) {
              driverObj.destroy();
              return;
            }
            const currentPath = window.location.hash.replace(/^#/, "") || "/";
            if (next.route !== currentPath) {
              navigate(next.route);
              window.setTimeout(() => driverObj.moveNext(), 80);
            } else {
              driverObj.moveNext();
            }
          },
        },
      })),
    });
    driverRef.current = driverObj;

    const firstRoute = steps[0].route;
    if (location.pathname !== firstRoute) {
      navigate(firstRoute);
      window.setTimeout(() => driverObj.drive(), 80);
    } else {
      driverObj.drive();
    }
  }

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(storageKey)) {
        window.localStorage.setItem(storageKey, "1");
        window.setTimeout(start, 400);
      }
    } catch {
      // localStorage unavailable (private browsing); skip auto-start silently.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <button
      type="button"
      onClick={start}
      data-tour="tour-replay"
      className="fixed bottom-4 right-4 z-40 rounded-full bg-[var(--pf-primary)] px-4 py-2 text-sm font-medium text-[var(--pf-surface)] shadow-lg"
    >
      Replay tour
    </button>
  );
}
