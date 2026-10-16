import OpenAI from "openai";

// Lazy init — dotenv index.js'de yüklendiği için
// modül seviyesinde env okumak boş döner.
let _openai = null;
function getOpenAI() {
  if (_openai) return _openai;
  const key = process.env.OPENAI_API_KEY;
  if (!key || key === "dummy" || key === "sk-your-key-here") return null;
  _openai = new OpenAI({ apiKey: key });
  return _openai;
}
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// ─── Senaryo tanımları (MVP) ───

const ENHANCED_NEGATIVE =
  "blurry, distorted, low quality, cartoon, anime, painting, watermark, text, logo, worst quality, green screen, monochrome, oversaturated, cropped, out of frame, duplicate, deformed, abstract, surreal, fantasy, nature scene, outdoor, park, forest, garden, landscape, jpeg artifacts";

const SCENARIOS = {
  "exam-anxiety": {
    title: "Sınav Anksiyetesi",
    context: `Kullanıcı sınav kaygısı yaşıyor. Amaç: sınav ortamına kademeli maruz bırakma.`,
    sceneCount: 4,
    hardcodedScenes: [
      {
        title: "Evde Çalışma Odası",
        description:
          "Rahat bir ev ortamında çalışma masası. Kitaplar, defterler ve masa lambası ile aydınlatılmış huzurlu bir çalışma köşesi.",
        prompt:
          "equirectangular 360 panorama, interior photograph of a cozy home study room, wooden desk with open textbooks and spiral notebooks, pencil holder with pens and pencils, warm desk lamp casting soft yellow light, tall bookshelf filled with books against the wall, comfortable padded office chair, window with sheer white curtains letting in natural daylight, beige painted walls, warm wooden parquet floor, laptop computer on desk, white coffee mug, colorful sticky notes on the wall above desk, small potted plant on windowsill, first person perspective sitting at the desk, photorealistic, architectural interior photography, high detail, 8k uhd, dslr, sharp focus, natural lighting",
        negativePrompt: ENHANCED_NEGATIVE,
        difficulty: 1,
        ambiance: "soft_music",
      },
      {
        title: "Okul Koridoru",
        description:
          "Bir lise koridoru. İki tarafta mavi metal dolaplar, sınıf kapıları ve floresan aydınlatma altında yürüyen öğrenciler.",
        prompt:
          "equirectangular 360 panorama, interior photograph of a high school hallway corridor, long perspective view, rows of blue metal lockers lining both walls, numbered classroom doors with small rectangular windows, bright fluorescent tube ceiling lights, polished light gray linoleum floor tiles with subtle pattern, large cork bulletin board with colorful pinned notices and flyers, red fire extinguisher mounted on wall, students in casual clothes walking in the distance, educational posters on walls between lockers, green exit sign above door at end of hallway, institutional beige walls, ceiling tiles, first person perspective standing in the corridor, photorealistic, architectural interior photography, high detail, 8k uhd, dslr, sharp focus",
        negativePrompt: ENHANCED_NEGATIVE,
        difficulty: 2,
        ambiance: "crowd_murmur",
      },
      {
        title: "Sınav Öncesi Bekleme Alanı",
        description:
          "Sınav salonunun önündeki bekleme alanı. Plastik sandalyelerde oturan gergin öğrenciler, duvardaki büyük saat ve sınav çizelgesi.",
        prompt:
          "equirectangular 360 panorama, interior photograph of a university examination hall entrance lobby and waiting area, rows of connected plastic chairs along the walls with students sitting nervously holding study notes, backpacks and bags on the tiled floor, large round analog wall clock showing 8:50 AM, heavy wooden double doors with small glass panels leading to the exam room, white notice board with printed exam schedule pinned with thumbtacks, bright fluorescent overhead panel lighting, off-white tiled floor, students in winter jackets looking anxious, wall-mounted water fountain, potted plant in corner, first person perspective sitting on a chair waiting, photorealistic, 8k uhd, dslr, sharp focus, natural indoor lighting",
        negativePrompt: ENHANCED_NEGATIVE,
        difficulty: 3,
        ambiance: "clock_ticking",
      },
      {
        title: "Sınav Salonu İçi",
        description:
          "Büyük bir sınav salonu. Sıra sıra dizilmiş bireysel masalar, üzerlerinde sınav kağıtları ve kalemler, ön duvarda büyük saat ve gözetmen masası.",
        prompt:
          "equirectangular 360 panorama, interior photograph of a large university examination hall during an exam, many rows of individual light wooden desks arranged in a grid pattern with spacing between them, blue plastic chairs at each desk, white exam papers and yellow pencils placed neatly on every desk, large round analog wall clock mounted on the front wall above a whiteboard, invigilator sitting at a large wooden desk at the front of the room with stacked papers, tall rectangular windows along the side wall with half-closed venetian blinds letting in strips of daylight, rows of fluorescent tube lights on the ceiling, students sitting at desks writing with heads down, first person perspective from a desk seat in the middle row looking forward, gray linoleum floor, institutional white walls, photorealistic, architectural interior photography, high detail, 8k uhd, dslr, sharp focus",
        negativePrompt: ENHANCED_NEGATIVE,
        difficulty: 5,
        ambiance: "clock_ticking",
      },
    ],
  },
  "social-anxiety": {
    title: "Sosyal Anksiyete",
    context: `Kullanıcı kalabalık ortamlarda kaygı yaşıyor. Amaç: sosyal ortamlara kademeli maruz bırakma.`,
    sceneCount: 4,
    hardcodedScenes: [
      {
        title: "Sessiz Kafe",
        description:
          "Az müşterili, sakin bir kafe. Büyük pencerelerden gün ışığı giriyor, birkaç ahşap masa ve sandalye.",
        prompt:
          "equirectangular 360 panorama, interior photograph of a quiet cozy coffee shop cafe, small round wooden tables with two chairs each, large floor-to-ceiling glass windows letting in warm natural light, espresso machine and pastry display case behind the counter, barista in apron behind wooden counter, ceramic coffee cups and saucers on tables, hanging pendant warm lights, exposed brick accent wall, potted green plants on windowsills, chalkboard menu on the wall behind counter, a few customers sitting quietly reading or using laptops, wooden plank flooring, first person perspective sitting at a table near the window, photorealistic, architectural interior photography, 8k uhd, dslr, sharp focus, warm lighting",
        negativePrompt: ENHANCED_NEGATIVE,
        difficulty: 1,
        ambiance: "soft_music",
      },
      {
        title: "Küçük Toplantı Odası",
        description:
          "5-6 kişilik bir toplantı odası. Oval masa, beyaz tahta, projeksiyon perdesi ve birkaç meslektaş.",
        prompt:
          "equirectangular 360 panorama, interior photograph of a small corporate meeting room, oval light wood conference table with six padded office chairs around it, large whiteboard on the wall with marker writing and diagrams, wall-mounted flat screen TV showing a presentation slide, glass water pitcher and paper cups on the table, notepads and pens in front of each seat, overhead recessed panel lighting, gray carpeted floor, frosted glass door, four colleagues in business casual sitting at the table looking toward the whiteboard, window with vertical blinds partially open, first person perspective sitting at the table, photorealistic, corporate photography, 8k uhd, dslr, sharp focus",
        negativePrompt: ENHANCED_NEGATIVE,
        difficulty: 2,
        ambiance: "silence",
      },
      {
        title: "Kalabalık Kafeterya",
        description:
          "Bir üniversite kafeteryası. Uzun masalar, tabldot servisi, tepsi taşıyan ve sohbet eden çok sayıda öğrenci.",
        prompt:
          "equirectangular 360 panorama, interior photograph of a busy crowded university cafeteria dining hall at lunchtime, long rectangular tables with many students sitting and eating together, food service counter with trays and buffet items visible, students standing in line holding orange plastic trays, overhead bright fluorescent lighting, large windows along one wall, colorful plastic chairs, tiled floor, vending machines against far wall, trash and recycling bins, conversations and socializing groups of students, bulletin boards with posters, first person perspective standing with a tray looking for a seat, photorealistic, 8k uhd, dslr, sharp focus, busy atmosphere",
        negativePrompt: ENHANCED_NEGATIVE,
        difficulty: 4,
        ambiance: "crowd_murmur",
      },
      {
        title: "Büyük Konferans Salonu",
        description:
          "Yüzlerce kişilik bir konferans salonu. Sahne, podyum, mikrofon ve sıralar dolu dinleyiciler.",
        prompt:
          "equirectangular 360 panorama, interior photograph of a large university auditorium lecture hall filled with people, tiered seating rows going upward with hundreds of seated audience members, wooden podium with microphone at the front on a raised stage, large projection screen behind the podium showing a presentation, bright stage spotlights and dimmer overhead lighting in audience area, red upholstered fold-down theater seats, carpeted stairs along the aisles, side exit doors with illuminated exit signs, speaker standing at podium addressing the crowd, first person perspective sitting in the middle section of audience rows looking toward the stage, photorealistic, event photography, 8k uhd, dslr, sharp focus",
        negativePrompt: ENHANCED_NEGATIVE,
        difficulty: 5,
        ambiance: "crowd_murmur",
      },
    ],
  },
  "acrophobia": {
    title: "Yükseklik Korkusu",
    context: `Kullanıcı yükseklik korkusu (akrofobi) yaşıyor. Amaç: yüksekliğe maruz bırakma.`,
    sceneCount: 3,
    // SDXL pipeline — Juggernaut XL veya RealVisXL checkpoint ile çalışır
    // ControlNet Depth ile mekansal tutarlılık sağlanır
    // SVD ile doğal kamera sallantısı eklenir
    pipeline: "sdxl",
    renderSettings: {
      width: 1024,
      height: 1024,
      steps: 35,
      cfg: 6.0,
      sampler: "dpmpp_2m",
      scheduler: "karras",
      depthStrength: 0.65,
      depthStartPercent: 0.0,
      depthEndPercent: 0.85,
      refineDenoise: 0.45,
      refineCfg: 5.5,
      refineSteps: 25,
    },
    svdSettings: {
      width: 1024,
      height: 576,
      videoFrames: 25,
      motionBucketId: 40,   // low = subtle sway, natural instability
      fps: 6,
      augmentationLevel: 0.02,
      steps: 20,
      cfg: 2.5,
      pingpong: true,
    },
    hardcodedScenes: [
      {
        title: "Çatıda — Ufuk Çizgisi",
        description:
          "40 katlı bir gökdelenin çatısındasınız. Karşınızda şehir silüeti, etrafınızda rüzgar. Yüksekte olduğunuzu hissediyorsunuz.",
        prompt:
          "first person POV standing on the rooftop of a 40-story modern glass and steel skyscraper, " +
          "feet visible in dark shoes near the concrete ledge at the bottom of frame, " +
          "looking outward at a sprawling city skyline with dozens of skyscrapers and office buildings at varying distances, " +
          "streets far below with miniature cars taxis and buses on asphalt roads, tiny pedestrians on sidewalks barely visible from extreme height, " +
          "flat weathered concrete rooftop surface with realistic cracks dirt stains and small puddles, " +
          "thin corroded metal safety railing at the building edge, " +
          "rooftop mechanical equipment including large HVAC units and radio antennas behind the viewer, " +
          "loose papers caught by wind tumbling across the rooftop surface, " +
          "strong depth perspective with buildings at varying distances creating parallax depth cues, " +
          "bright golden hour afternoon sunlight with physically accurate long shadows, wispy cirrus clouds in deep blue sky, " +
          "atmospheric perspective with slight haze on distant buildings, " +
          "ultra realistic, cinematic lighting, wide angle lens, highly detailed, 8k uhd, " +
          "shot on Canon EOS R5, photorealistic, hyperdetailed textures, architectural photography",
        negativePrompt:
          "blurry, low quality, cartoon, distorted, deformed, unrealistic, extra limbs, bad anatomy, duplicate objects, " +
          "anime, painting, watermark, text, logo, worst quality, fisheye distortion, floating objects, broken geometry, " +
          "disconnected elements, noise, grain, abstract, surreal, fantasy, green screen, monochrome, " +
          "third person view, external camera, aerial view, drone shot",
        difficulty: 3,
        ambiance: "silence",
        // Per-scene SVD override: very subtle sway for the "looking outward" perspective
        svdOverrides: { motionBucketId: 30, augmentationLevel: 0.01 },
        seed: 424242,
      },
      {
        title: "Çatıda — Aşağı Bakış",
        description:
          "Aynı çatıda kenarına yaklaştınız. Aşağı baktığınızda 40 kat altındaki sokağı, küçücük arabaları ve yürüyen insanları görüyorsunuz.",
        prompt:
          "first person POV from the very edge of a 40-story skyscraper rooftop looking down over the ledge, " +
          "feet visible in dark shoes on dirty concrete rooftop near the edge, " +
          "leaning slightly forward toward the thin weathered metal railing, " +
          "the building facade drops sheer vertically below showing hundreds of reflective glass windows in rows going down 40 floors, " +
          "at the ground level far below the street is visible with tiny toy-sized cars parked along curbs, " +
          "miniature pedestrians as small dots walking on narrow sidewalks, yellow taxi cabs and crosswalk markings visible from extreme height, " +
          "adjacent buildings at lower heights with visible rooftop details like water tanks and satellite dishes, " +
          "vertigo-inducing extreme downward perspective with the ground feeling impossibly distant, " +
          "strong depth perspective with realistic scale, city skyline with buildings at varying distances, " +
          "a piece of loose plastic bag caught by wind floating past below eye level, " +
          "concrete rooftop texture with weathering and small puddles, " +
          "late afternoon warm sunset light with orange and gold tones casting dramatic long shadows, " +
          "ultra realistic, cinematic lighting, wide angle lens, highly detailed, 8k uhd, " +
          "shot on Canon EOS R5, photorealistic, hyperdetailed, architectural photography, real-world scale accuracy",
        negativePrompt:
          "blurry, low quality, cartoon, distorted, deformed, unrealistic, extra limbs, bad anatomy, duplicate objects, " +
          "anime, painting, watermark, text, logo, worst quality, fisheye distortion, floating objects, broken geometry, " +
          "disconnected elements, noise, grain, duplicated buildings, inconsistent perspective, abstract, surreal, " +
          "third person view, external camera, aerial view, drone shot",
        difficulty: 4,
        ambiance: "silence",
        svdOverrides: { motionBucketId: 45, augmentationLevel: 0.02 },
        seed: 424243,
      },
      {
        title: "Çatıda — Kenardan Bakış",
        description:
          "Çatının en kenarındasınız. Korkuluğun hemen ötesinde 150 metrelik boşluk. Rüzgar esiyor.",
        prompt:
          "first person POV standing at the absolute edge of a 40-story skyscraper rooftop right against the thin corroded metal railing, " +
          "both hands visible gripping the cold metal railing bar with white knuckles showing tension, " +
          "feet visible in dark shoes on cracked weathered concrete right at the precipice edge, " +
          "looking down past the railing into the void below, " +
          "the sheer vertical drop of the glass and concrete building wall plummeting 150 meters straight down to the street, " +
          "cars appear as tiny toy models far below on the dark asphalt road with white lane markings, " +
          "people are barely visible minuscule dots casting small shadows on the sidewalk, " +
          "the city sprawls outward with buildings of various heights creating strong parallax depth cues, " +
          "the distant horizon line is far away emphasizing the extreme altitude, " +
          "loose papers and small debris swirling on the rooftop surface from strong wind, " +
          "a pigeon flying at eye level near the building edge emphasizing the terrifying altitude, " +
          "rooftop behind has realistic industrial equipment ventilation shafts and metal access door, " +
          "extreme height, strong depth perspective, realistic scale, " +
          "dramatic golden hour sunset lighting with warm orange light on building facades and cool blue shadows, " +
          "volumetric atmospheric haze on distant buildings, " +
          "ultra realistic, cinematic lighting, wide angle lens, highly detailed, 8k uhd, " +
          "shot on Canon EOS R5, photorealistic, hyperdetailed textures and materials, extreme depth of field, architectural photography",
        negativePrompt:
          "blurry, low quality, cartoon, distorted, deformed, unrealistic, extra limbs, bad anatomy, duplicate objects, " +
          "anime, painting, watermark, text, logo, worst quality, fisheye distortion, floating objects, broken geometry, " +
          "disconnected elements, unnatural fingers, noise, grain, duplicated buildings, inconsistent perspective, " +
          "surreal colors, abstract patterns, third person view, external camera, aerial view, drone shot",
        difficulty: 5,
        ambiance: "silence",
        // More motion for the edge scene — wind sway effect
        svdOverrides: { motionBucketId: 55, augmentationLevel: 0.03 },
        seed: 424244,
      },
    ],
  },
};

export async function planScenes(scenarioId, scenarioTitle) {
  const scenario = SCENARIOS[scenarioId];
  const sceneCount = scenario?.sceneCount || 4;
  const context = scenario?.context || `Terapi senaryosu: ${scenarioTitle}`;

  // Hardcoded sahneler varsa doğrudan döndür (en güvenilir sonuç)
  if (scenario?.hardcodedScenes) {
    console.log(`[scene-planner] Hardcoded sahneler kullanılıyor: ${scenarioId} (${scenario.hardcodedScenes.length} sahne)`);
    return scenario.hardcodedScenes;
  }

  // OpenAI key yoksa dummy sahneler döndür
  const openai = getOpenAI();
  if (!openai) {
    console.warn("[scene-planner] OpenAI key yok, dummy sahneler kullanılıyor.");
    return Array.from({ length: sceneCount }, (_, i) => ({
      title: `Sahne ${i + 1}`,
      description: `${scenarioTitle} için terapi sahnesi ${i + 1}`,
      prompt: `equirectangular 360 panorama, peaceful ${scenarioTitle} therapy scene, calm environment, photorealistic, high quality, 8k`,
      negativePrompt: "blurry, distorted, low quality, cartoon, watermark, text",
      difficulty: i + 1,
      ambiance: ["birds", "rain", "soft_music", "silence"][i % 4],
    }));
  }

  const systemPrompt = `Sen bir VR maruz bırakma terapisi sahne planlayıcısısın.
Görevin: 360 derece panoramik GERÇEK MEKAN sahneleri tasarlamak.

MUTLAKA UYULMASI GEREKEN KURALLAR:
1. Her sahne GERÇEK bir fiziksel mekan olmalı (oda, koridor, salon, sınıf gibi)
2. Prompt'lar SOMUT objeler içermeli: masa, sandalye, kapı, pencere, lamba, kağıt, kalem, saat, tahta, vs.
3. ASLA soyut, doğa veya "huzurlu park" gibi sahneler KULLANMA
4. Kullanıcı bu mekanda oturuyormuş gibi hissetmeli — birinci şahıs perspektifi
5. Promptlar İngilizce ve "equirectangular 360 panorama, interior photograph" ile başlamalı
6. Detaylı mimari ve mobilya açıklaması ver (duvar rengi, zemin tipi, aydınlatma, pencere)
7. Her prompt en az 3 cümle uzunluğunda olmalı

Her sahne için JSON formatında:
- title: Sahne başlığı (Türkçe)
- description: Ortam açıklaması (Türkçe, 2-3 cümle)
- prompt: Stable Diffusion promptu (İngilizce, detaylı, somut objeler içeren)
- negativePrompt: İngilizce negative prompt
- difficulty: 1-5 zorluk (1=rahat, 5=stresli)
- ambiance: Ses önerisi (rain, birds, crowd_murmur, silence, soft_music, clock_ticking, keyboard_typing)

Yanıtı sadece JSON objesi olarak ver: { "scenes": [...] }`;

  const userPrompt = `Senaryo: ${scenarioTitle}
Bağlam: ${context}

${sceneCount} sahnelik terapi planını üret.
HER sahne GERÇEK bir iç mekan olmalı, somut objeler (masa, sandalye, pencere, kağıt, vb.) içermeli.
Prompt'lar Stable Diffusion 1.5 için optimize edilmeli — detaylı, somut, foto-gerçekçi.`;

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0].message.content;
  const parsed = JSON.parse(content);

  // LLM bazen { scenes: [...] } bazen doğrudan [...] döner
  const scenes = Array.isArray(parsed) ? parsed : parsed.scenes || [];

  if (scenes.length === 0) {
    throw new Error("LLM sahne üretemedi");
  }

  return scenes;
}

export { SCENARIOS };
