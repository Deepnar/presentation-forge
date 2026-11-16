// Sample institutional chrome for the benchmark and the developer scene
// route: a 1x1 banner and crest, two presenters, every mark switched on —
// so a compiled deck exercises the chrome layer without a real identity.
// Lives in src/ because the server uses it; the benchmark tool re-exports it.
import { surfaceForPlan } from "../packages/compiler/background.ts";

const PNG_1X1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const PRESENTERS = ["Asha Rao", "Bruno Dias"];

// Adapter-resolved chrome, mirroring the 3E-3 test seam: first slide
// is the title surface, the rest are content surfaces (emission
// mapping unchanged). The contrast background is the resolved plate
// corner for the slide's planned surface when a plate replaces the
// flat ground, else palette.bg — the ground V2 actually renders on
// every family. Chrome policy itself is untouched.
export function benchmarkChrome(intent, design, { backgrounds = null, plan = null } = {}) {
  const surfaceById = new Map(
    (plan?.slides ?? []).map((s) => [s.slideId, surfaceForPlan(s)]),
  );
  return {
    slides: intent.slides.map((s, i) => {
      const surface = surfaceById.get(s.id) ?? (i === 0 ? "title" : "content");
      return {
        slideId: s.id,
        surface: i === 0 ? "title" : "content",
        branding: "full",
        banner: { src: PNG_1X1, ratio: 4 },
        selectedCrest: { src: PNG_1X1, ratio: 0.8 },
        primaryCrestRatio: 0.8,
        crestOnContentSlides: true,
        presenterOnSlides: true,
        slideNumbers: true,
        suppressPresenter: false,
        presenterText: PRESENTERS[i % PRESENTERS.length],
        index: i + 1,
        total: intent.slides.length,
        background: backgrounds?.assets?.[surface]?.contrastBg ?? design.palette.bg.hex,
        mutedInk: design.palette.inkMuted.hex,
        captionFamily: design.roles.caption?.family,
      };
    }),
  };
}
