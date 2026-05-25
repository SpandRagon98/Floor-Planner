import React from "react";
import { Home, Loader2 } from "lucide-react";

export default function LandingPage({ theme, onGenerate, onContinueWithout, isGenerating, generationStep, isEntering }) {
  const premiumHighlights = [
    "Precision 2D planning with immersive 3D preview",
    "Room, furniture, and export workflows ready",
    "A polished workspace for faster concept validation",
  ];

  return (
    <div className={`app-shell landing-page landing-page--immersive ${theme === "dark" ? "dark-theme" : "light-theme"}`}>
      <div className="landing-ambient-grid" />
      <div className="landing-ambient-orb landing-ambient-orb--one" />
      <div className="landing-ambient-orb landing-ambient-orb--two" />
      <div className="landing-ambient-orb landing-ambient-orb--three" />
      <div className="landing-ambient-ring landing-ambient-ring--one" />
      <div className="landing-ambient-ring landing-ambient-ring--two" />

      <div className="landing-immersive-shell">
        <section className="landing-immersive-card">
          <div className="landing-immersive-badge-wrap">
  <span className="pill landing-immersive-pill">
    <span className="landing-pill-text">Premium Space Planning Suite</span>
  </span>
</div>

<h1 className="landing-immersive-title">
  <span className="landing-immersive-title-main">Welcome to Floora</span>
  <span className="landing-immersive-title-sub">Your floor planner assistant</span>
</h1>

          <p className="landing-immersive-subtitle">
            From concept to clarity — step into a premium planning workspace designed to make every layout feel clean,
            controlled, and presentation-ready from the very first click.
          </p>

          <div className="landing-immersive-points">
            {premiumHighlights.map((item) => (
              <div key={item} className="landing-immersive-point">
                <span className="landing-immersive-point-dot" />
                <span>{item}</span>
              </div>
            ))}
          </div>

          <div className="landing-immersive-actions">
            <button
              type="button"
              className="primary-btn landing-continue-btn landing-immersive-btn"
              onClick={onContinueWithout}
              disabled={isEntering}
            >
              {isEntering ? <Loader2 size={18} className="landing-btn-spinner" /> : <Home size={18} />}
              {isEntering ? "Opening your workspace..." : "Explore Now"}
            </button>

            {isEntering && (
              <div className="landing-entering-text">
                <span className="landing-entering-line" />
                <span>Preparing your premium workspace...</span>
                <span className="landing-entering-line" />
              </div>
            )}
          </div>
        </section>
      </div>

      {isEntering && (
        <div className="landing-transition-overlay" aria-hidden="true">
          <div className="landing-transition-core">
            <div className="landing-transition-spinner-ring" />
            <div className="landing-transition-spinner-ring landing-transition-spinner-ring--two" />
            <div className="landing-transition-mark" />
          </div>
          <div className="landing-transition-copy">
            <div className="landing-transition-title">Launching your planning workspace</div>
            <div className="landing-transition-subtitle">Loading tools, views, and project controls...</div>
          </div>
        </div>
      )}
    </div>
  );
}
