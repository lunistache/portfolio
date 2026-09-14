// This is a personal-portfolio variant of the solar system scene: for now
// it only shows the Sun and one "planet" representing me. Clicking that
// planet opens my CV. More planets (projects, skills, etc.) can be added
// to this list later the same way the other bodies used to be.
// orbitRadius/sizes/speeds are purely stylistic, chosen for a nice viewer.

export const BODIES = [
  {
    id: "sun",
    name: "Sun",
    radius: 2.6,
    orbitRadius: 0,
    rotationSpeed: 0.02,
    axialTilt: 0,
    isStar: true,
    texture: { file: "textures/2k_sun.jpg" },
    facts: "",
    // clicking the Sun a second time pops this video up, starting at 0:18;
    // "Open in new tab" goes to the normal YouTube page at the same moment
    cvLink: "https://www.youtube.com/embed/rDQO0nxfnhI?start=18&autoplay=1",
    externalLink: "https://youtu.be/rDQO0nxfnhI?t=18",
    linkLabel: "Watch video ↗",
    moons: [],
  },
  {
    id: "earth",
    name: "Personal",
    radius: 1,
    orbitRadius: 9.5,
    orbitInclination: 0.05, // ~3°, so the orbits aren't all parallel
    orbitNode: 0,
    rotationSpeed: 0.02,
    axialTilt: -0.349, // ~20°, leaning away from the Sun instead of standing perfectly upright
    // "3d model bust" by GR-video, CC BY 4.0 (see models/bust/license.txt
    // and the credit in index.html) — stands in for "me" instead of a
    // planet (loaded async, see models.js)
    // ~800k triangles: casting a shadow would redraw it 6 more times a frame
    model: { file: "models/bust/scene.gltf", castShadow: false },
    facts: "Data Engineer & Analyst.\nSpeaks French, Italian, Spanish and English.\nOrbiting moons: CV, Music.",
    moons: [
      {
        name: "CV",
        radius: 0.35,
        orbitRadius: 2.4,
        orbitSpeed: 0.5,
        orbitTilt: 0.45, // ~26°
        rotationSpeed: 0.04, // spins in place, same idea as a planet's own rotationSpeed
        // "Scroll" by Poly by Google, CC BY 3.0 (see models/scroll/license.txt
        // and the credit in index.html)
        model: { file: "models/scroll/scroll.glb" },
        facts: "Data Engineer & Analyst.\nPython, SQL, Azure/Databricks, Power BI, ETL pipelines, dashboards, ML.",
        cvLink: "cv.pdf",
      },
      {
        name: "Music",
        radius: 0.35,
        orbitRadius: 3.4,
        orbitSpeed: 0.3,
        orbitTilt: -0.3, // ~-17°
        rotationSpeed: 0.04,
        leanToSun: 0.52, // ~30° from vertical, top of the cassette leans toward the Sun
        // "Cassette tape" by Poly by Google, CC BY 3.0 (see
        // models/cassette/license.txt and the credit in index.html)
        model: { file: "models/cassette/cassette.glb" },
        facts: "Music.",
        // clicking the cassette a second time plays this video in the popup
        // (the background music pauses while it's open)
        cvLink: "https://www.youtube.com/embed/-JZkoMYRwHQ?autoplay=1",
        externalLink: "https://www.youtube.com/watch?v=-JZkoMYRwHQ",
        linkLabel: "Play ↗",
      },
    ],
  },
  {
    id: "apps",
    name: "Apps",
    radius: 1,
    orbitRadius: 16,
    orbitInclination: -0.07, // ~4°
    orbitNode: 2.1,
    rotationSpeed: 0.017,
    axialTilt: 0,
    // "Laptop" by J-Toastie and "Phone" by Alex Safayan, both CC BY 3.0 (see
    // models/*/license.txt and the credit in index.html) — each app I've
    // built orbits it as a moon
    model: { file: "models/computer/computer.glb", lighten: 0.04 },
    // the phone stands beside the laptop (on the side its screen faces),
    // leaning ~20°, and spins at its own speed — a separate object, not merged
    companions: [
      {
        model: { file: "models/phone/phone.glb", lighten: 0.04 },
        radius: 0.37,
        position: [1.35, 0, 0],
        tilt: 0.35,
        initialRotationY: Math.PI / 2, // screen starts facing the laptop
        rotationSpeed: 0.045,
      },
    ],
    facts: "Apps I've built.\nEach moon is one of them.",
    moons: [
      {
        name: "Kalbon",
        radius: 0.25,
        orbitRadius: 3,
        orbitSpeed: 0.35,
        orbitTilt: 0.349, // ~20°, instead of the small random tilt moons get by default
        rotationSpeed: 0.017,
        // no real photo for this one — generated procedurally (see textures.js)
        // so it reads as an Earth-like planet without literally being Earth
        texture: {
          procedural: {
            seed: 91827,
            oceanColor: "#0e5c6b",
            landColors: ["#2f7d4f", "#8aa64a"],
          },
          proceduralClouds: { seed: 552013 },
        },
        atmosphere: { color: "#57e0a3", power: 3.6, opacity: 0.55 },
        facts: "Kalbon.\nSaaS that estimates an event's carbon footprint before it happens.\nBuilt end-to-end: Next.js, TypeScript, PostgreSQL.",
      },
    ],
  },
  {
    id: "websites",
    name: "Websites",
    radius: 0.85,
    orbitRadius: 22,
    orbitInclination: 0.09, // ~5°
    orbitNode: 4.2,
    rotationSpeed: 0.015,
    axialTilt: 0.3,
    // no model or texture — a procedural glowing "www" wireframe globe
    // (see makeWireframeGlobe in main.js); each website orbits it as a moon
    wireframeGlobe: { color: "#6f9fb8", opacity: 0.45 },
    atmosphere: { color: "#6f9fb8", power: 4, opacity: 0.15 },
    facts: "Websites I've built.\nEach moon is one of them.",
    // `cvLink` is the generic "second click opens it in the popup" link —
    // here it's the live site instead of a PDF, with its own button label
    moons: [
      {
        name: "Luca Fontaine",
        radius: 0.32,
        orbitRadius: 2.4,
        orbitSpeed: 0.45,
        orbitTilt: 0.4, // ~23°
        rotationSpeed: 0.04, // spins on Y...
        rotationSpeedX: 0.03, // ...and on X, so it tumbles
        // "CC0 - Clapperboard" by plaggy, CC BY 4.0 (see
        // models/clapperboard/license.txt and the credit in index.html)
        model: { file: "models/clapperboard/scene.gltf", lighten: 0.38, thicken: 2.5 },
        facts: "Luca Fontaine, actor.\nPortfolio site with headshots, résumé, photo gallery, coaching and contact.",
        cvLink: "https://lunistache.github.io/luca-fontaine/index.html",
        linkLabel: "Visit website ↗",
      },
      {
        name: "Bleue Frog",
        radius: 0.32,
        orbitRadius: 3.4,
        orbitSpeed: 0.3,
        rotationSpeed: 0.02,
        orbitTilt: -0.55, // ~-32°
        // "Frog" by jeremy, CC BY 3.0 (see models/frog/license.txt and the
        // credit in index.html) — its green body material repainted blue
        model: { file: "models/frog/frog.glb", recolor: { "4CAF50": "#3a7aea" } },
        facts: "Bleue Frog. Paris creative production collective:\nfilm production, an upcoming record label, and events.",
        cvLink: "https://lunistache.github.io/bleuefrog/",
        linkLabel: "Visit website ↗",
      },
      {
        name: "Panzon",
        radius: 0.32,
        orbitRadius: 4.4,
        orbitSpeed: 0.22,
        rotationSpeed: 0.02,
        orbitTilt: 0.2, // ~11°
        // the winged lion of Venice, like the Panzon logo: "Lion" by jeremy
        // and "wings" by Michael Fuchs, both CC BY 3.0 (see models/*/license.txt
        // and the credit in index.html), made chubbier and repainted gold
        model: {
          parts: [
            { file: "models/lion/lion.glb", stretch: [1.6, 1, 1] },
            { file: "models/wings/wings.glb", scale: 0.075, position: [0, 4.8, 0.3], rotationY: Math.PI }, // curving forward, a little behind the mane
          ],
          recolor: {
            DD9944: "#e0a84a", // body
            FF5722: "#a86a24", // mane
            lambert2SG: "#f2d58a", // wing feathers
            lambert3SG: "#d9b060",
            lambert5SG: "#b8903f",
          },
        },
        facts: "Panzon. Italian food from Venice.\nTiramisu to order and pasta-making classes.",
      },
    ],
  },
];

export const DWARF_BODIES = [];

export const BODY_INDEX = Object.fromEntries(BODIES.map((b, i) => [b.id, i]));
