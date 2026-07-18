import { type PointerEvent, useRef } from "react";

import { PrismBrand } from "./AppChrome";

type LandingPageProps = {
  isSignedIn: boolean;
  onEnter: () => void;
};

const paths = [
  {
    number: "01",
    context: "Basketball",
    title: "The perfect pass",
    copy: "Explore force through the snap and speed of a court-side pass.",
    className: "path-card-court",
    glyph: "↗",
  },
  {
    number: "02",
    context: "Formula 1",
    title: "Built for speed",
    copy: "Tune mass and acceleration from the pit wall of a racing lab.",
    className: "path-card-race",
    glyph: "→",
  },
  {
    number: "03",
    context: "Space",
    title: "Ready for launch",
    copy: "Discover the same relationship through thrust, rockets, and orbit.",
    className: "path-card-space",
    glyph: "↑",
  },
];

export function LandingPage({ isSignedIn, onEnter }: LandingPageProps) {
  const enterLabel = isSignedIn ? "Open workspace" : "Enter Prism";
  const heroArtRef = useRef<HTMLDivElement>(null);

  function moveHero(event: PointerEvent<HTMLDivElement>) {
    const element = heroArtRef.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const bounds = element.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    element.style.setProperty("--hero-tilt-x", `${x * 5}deg`);
    element.style.setProperty("--hero-tilt-y", `${y * -5}deg`);
    element.style.setProperty("--hero-shift-x", `${x * 10}px`);
    element.style.setProperty("--hero-shift-y", `${y * 10}px`);
  }

  function resetHero() {
    const element = heroArtRef.current;
    element?.style.removeProperty("--hero-tilt-x");
    element?.style.removeProperty("--hero-tilt-y");
    element?.style.removeProperty("--hero-shift-x");
    element?.style.removeProperty("--hero-shift-y");
  }

  return (
    <main className="landing-page">
      <header className="landing-nav">
        <PrismBrand />
        <nav aria-label="Primary navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#for-everyone">For classrooms</a>
        </nav>
        <button className="landing-nav-cta" type="button" onClick={onEnter}>
          {enterLabel}<span aria-hidden="true">↗</span>
        </button>
      </header>

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <p className="landing-kicker"><span aria-hidden="true" /> AI-powered learning, thoughtfully personal</p>
          <h1 id="landing-title">Same lesson.<br /><em>A different spark</em><br />for every mind.</h1>
          <p className="landing-lede">Prism turns one teacher-designed objective into an interactive experience shaped around what each student already loves.</p>
          <div className="landing-hero-actions">
            <button type="button" onClick={onEnter}>{enterLabel}<span aria-hidden="true">→</span></button>
            <a href="#how-it-works">See the idea <span aria-hidden="true">↓</span></a>
          </div>
          <p className="landing-proof"><span aria-hidden="true">✦</span> The context changes. The rigor never does.</p>
        </div>

        <div className="prism-hero-art" ref={heroArtRef} onPointerMove={moveHero} onPointerLeave={resetHero} aria-label="One physics objective branching into basketball, racing, and space learning experiences">
          <span className="hero-orbit orbit-outer" />
          <span className="hero-orbit orbit-inner" />
          <span className="hero-spark spark-one">✦</span>
          <span className="hero-spark spark-two">✦</span>
          <div className="objective-card-landing">
            <span>Protected objective</span>
            <strong>F = ma</strong>
            <small>Newton's second law</small>
          </div>
          <div className="floating-context context-court"><span>01</span><strong>court</strong><i aria-hidden="true">●</i></div>
          <div className="floating-context context-race"><span>02</span><strong>speed</strong><i aria-hidden="true">➜</i></div>
          <div className="floating-context context-space"><span>03</span><strong>orbit</strong><i aria-hidden="true">✦</i></div>
          <span className="hero-caption">one idea · three ways in</span>
        </div>
      </section>

      <div className="landing-marquee" aria-hidden="true">
        <div className="landing-marquee-track">
          {[0, 1].map((copy) => (
            <div className="landing-marquee-group" key={copy}>
              <span>One objective</span><i>✦</i><span>Personal context</span><i>✦</i><span>Interactive discovery</span><i>✦</i>
            </div>
          ))}
        </div>
      </div>

      <section className="landing-intro" id="how-it-works">
        <div className="landing-section-number"><span>01</span><p>The Prism idea</p></div>
        <div className="landing-intro-copy">
          <p className="eyebrow">A better doorway into learning</p>
          <h2>Keep the destination.<br /><em>Change the way in.</em></h2>
          <p>A teacher sets the learning objective once. Prism safely personalizes the scenario, language, and interactive lab for every student, so curiosity gets a head start.</p>
        </div>
        <div className="landing-equation" aria-label="Objective plus interest becomes discovery">
          <div><span>01</span><strong>Objective</strong><small>The shared academic goal</small></div>
          <b aria-hidden="true">+</b>
          <div><span>02</span><strong>Interest</strong><small>A student's familiar world</small></div>
          <b aria-hidden="true">=</b>
          <div className="equation-result"><span>03</span><strong>Discovery</strong><small>Learning that feels made for you</small></div>
        </div>
      </section>

      <section className="learning-paths" aria-labelledby="paths-title">
        <div className="paths-heading">
          <p className="eyebrow">One law of motion</p>
          <h2 id="paths-title">Three students.<br />Three worlds.</h2>
          <p>Every path preserves the same objective and approximate difficulty. Only the spark changes.</p>
        </div>
        <div className="path-card-grid">
          {paths.map((path) => (
            <article className={`landing-path-card ${path.className}`} key={path.context}>
              <div className="path-card-top"><span>{path.number}</span><i aria-hidden="true">{path.glyph}</i></div>
              <div className="path-card-art" aria-hidden="true"><span /><span /><b>{path.glyph}</b></div>
              <p>{path.context}</p>
              <h3>{path.title}</h3>
              <small>{path.copy}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-workflow" id="for-everyone">
        <div className="workflow-heading">
          <div className="landing-section-number light"><span>02</span><p>From lesson to launch</p></div>
          <h2>A classroom flow that<br /><em>gets out of the way.</em></h2>
          <p>Simple enough to teach with today. Personal enough to make every student feel seen.</p>
        </div>
        <div className="workflow-steps">
          <article><span>01</span><div className="workflow-icon icon-compose" aria-hidden="true"><i /><i /><i /></div><h3>Teacher sets the north star.</h3><p>Create a class, write one clear objective, and publish the assignment.</p></article>
          <article><span>02</span><div className="workflow-icon icon-prism" aria-hidden="true"><i>P</i><i /><i /></div><h3>Prism shapes the journey.</h3><p>Validated AI connects the lesson to each student's interests without changing the goal.</p></article>
          <article><span>03</span><div className="workflow-icon icon-explore" aria-hidden="true"><i /><i /><i>↗</i></div><h3>Students learn by doing.</h3><p>Explore variables, ask for progressive hints, reflect, and submit from one guided lab.</p></article>
        </div>

        <div className="landing-product-window">
          <div className="product-window-bar"><span /><span /><span /><p>Prism · Student experiment</p><small>Saved</small></div>
          <div className="product-window-content">
            <div className="product-window-copy">
              <p className="eyebrow">Your mission · Basketball force lab</p>
              <h3>How much force<br />powers the pass?</h3>
              <p>Change the basketball's mass and acceleration. Watch force respond in real time.</p>
              <div className="mini-progress"><span><i /></span><small>2 of 3 discoveries complete</small></div>
            </div>
            <div className="product-simulation" aria-hidden="true">
              <div className="sim-court">
                <i className="sim-ball" />
                <svg className="sim-hoop" viewBox="0 0 200 240" role="presentation">
                  <path className="hoop-support" d="M168 62v158M168 181h22" />
                  <rect className="hoop-board" x="43" y="21" width="124" height="75" rx="3" />
                  <rect className="hoop-square" x="84" y="51" width="51" height="34" rx="2" />
                  <path className="hoop-brace" d="M135 69h33" />
                  <ellipse className="hoop-rim" cx="108" cy="96" rx="42" ry="9" />
                  <path className="hoop-net-edge" d="M68 99l11 67h57l12-67" />
                  <path className="hoop-net" d="M78 101l12 65m17-65 1 65m19-65-8 65M73 121h70M76 142h64M80 160h57M75 108l56 58m10-58-53 58" />
                </svg>
              </div>
              <div className="sim-readout"><span>Mass<strong>0.62 kg</strong></span><span>Acceleration<strong>8.0 m/s²</strong></span><span>Force<strong>4.96 N</strong></span></div>
            </div>
            <aside className="product-coach"><span>✦</span><p>Prism guide</p><h4>What do you notice as acceleration increases?</h4><button type="button" tabIndex={-1}>Ask for a hint</button></aside>
          </div>
        </div>
      </section>

      <section className="landing-audience">
        <article className="audience-teacher">
          <p className="eyebrow">For teachers</p>
          <h2>Your objective<br />stays the anchor.</h2>
          <p>Create assignments, publish with confidence, and see how students are progressing without building thirty versions of one lesson.</p>
          <ul><li><span>01</span> One assignment to create</li><li><span>02</span> Clear completion visibility</li><li><span>03</span> No black-box grading</li></ul>
        </article>
        <article className="audience-student">
          <p className="eyebrow">For students</p>
          <h2>Start somewhere<br />you already belong.</h2>
          <p>Step into familiar worlds, explore ideas with your hands, and get a nudge when you need one, not the answer handed to you.</p>
          <div className="student-bubbles" aria-hidden="true"><span>curiosity</span><span>confidence</span><span>momentum</span></div>
        </article>
      </section>

      <section className="landing-principle">
        <span className="principle-star" aria-hidden="true">✦</span>
        <p className="eyebrow">Our learning principle</p>
        <blockquote>Personalization should change the <em>invitation</em>,<br />never the expectation.</blockquote>
        <p>Same objective. Comparable difficulty. A learning experience that finally feels close enough to touch.</p>
      </section>

      <section className="landing-final-cta">
        <div>
          <p className="eyebrow">The lesson is ready</p>
          <h2>Find their<br /><em>way in.</em></h2>
        </div>
        <button type="button" onClick={onEnter}><span>{enterLabel}</span><i aria-hidden="true">↗</i></button>
        <div className="cta-orbits" aria-hidden="true"><span /><span /><span /></div>
      </section>

      <footer className="landing-footer">
        <PrismBrand />
        <p>Learning, made personal.</p>
        <button className="text-button" type="button" onClick={onEnter}>{enterLabel}</button>
        <small>© {new Date().getFullYear()} Prism</small>
      </footer>
    </main>
  );
}
