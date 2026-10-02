import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AppShell,
  OneClickLogin,
  StoryPanel,
  TourRunner,
  ConceptBadge,
  type TourStep,
} from "@kit";
import { NAV } from "../nav";
import tourData from "../tour.json";

const STORAGE_KEY = "pf-login-prior-auth-tracker-v1";
const TOUR_STORAGE_KEY = "pf-tour-prior-auth-tracker-v1";

export function Story() {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const isLoggedInFromStorage = localStorage.getItem(STORAGE_KEY) === "1";
    setIsLoggedIn(isLoggedInFromStorage);
  }, []);

  const handleLogin = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setIsLoggedIn(true);
  };

  if (!isLoggedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface">
        <OneClickLogin
          personaName="Dana Whitfield"
          personaRole="Prior authorization coordinator"
          practiceName="Riverside Orthopedic Associates"
          onLogin={handleLogin}
        />
      </div>
    );
  }

  const tourSteps: TourStep[] = tourData.map((step) => ({
    id: step.id,
    screen_id: step.screen_id,
    route: step.route,
    target: step.target,
    title: step.title,
    body: step.body,
  }));

  return (
    <>
      <AppShell
        brandName="Riverside Orthopedic Associates"
        brandUrl="/"
        brandEmail="info@riversideortho.com"
        personaName="Dana Whitfield"
        personaRole="Prior authorization coordinator"
        nav={NAV}
      >
        <div className="max-w-4xl mx-auto px-6 py-12">
          <div className="mb-8">
            <ConceptBadge />
          </div>

          <h1 className="text-4xl font-serif font-bold text-ink mb-8">
            Prior authorization doesn't have to cost $14,000 per quarter
          </h1>

          <div className="space-y-8">
            <StoryPanel
              practiceName="Riverside Orthopedic Associates"
              practiceType="Orthopedic practice, outpatient imaging and procedures"
              personaName="Dana Whitfield"
              dayInTheLife="Dana manages prior auth for a 6-provider orthopedic practice. Here's her morning before and after this tool."
              painPoints={[
                "No single view of auth status across payers",
                "Denials are discovered late, after days have already passed on the appeal clock",
                "Appeal deadlines are tracked from memory, not from a system",
                "No record of which denial reasons recur, so the practice can't fix root causes",
              ]}
              costOfPain="Dana estimates 6-8 hours per week re-checking portals manually, and the practice loses an estimated $14,000 per quarter in missed-deadline denials that could have been appealed."
              before="7:30am: Dana opens the spreadsheet and four payer portals in separate tabs. She manually copies status for 12 open cases. At 8:52am she happens to notice, while checking an unrelated case, that case #4471 (Meridian Health Partners, lumbar MRI for patient J. Alvarez) was decided 3 business days ago: denied for 'missing clinical documentation.' The appeal window is 5 business days from the decision date — only 2 business days remain, and no one has started the appeal."
              after="7:30am: Dana opens the tracker. The dashboard already shows case #4471 flagged red in Denials, 'Denied — missing documentation,' with 2 business days left on the clock and the missing document already identified. Dana attaches the missing clinical note, moves the case into the Appeals queue herself, reviews the drafted appeal summary, and submits it in two clicks. Nothing moved on its own — she drove every step. She moves to the next flagged case; all 12 open cases are visible in one list with days-to-SLA shown for each."
              onStartTour={() => {
                // Tour will start automatically via TourRunner
              }}
            />
            <div className="pt-8 border-t border-muted">
              <p className="text-muted text-sm mb-4">
                Take the tour to see how each part of the system works.
              </p>
            </div>
          </div>
        </div>
      </AppShell>

      <TourRunner storageKey={TOUR_STORAGE_KEY} steps={tourSteps} />
    </>
  );
}
