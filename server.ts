import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import path from 'path';
import fs from 'fs';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Initialize GoogleGenAI server-side with User-Agent header as required
const apiKey = process.env.GEMINI_API_KEY || '';
let aiClient: GoogleGenAI | null = null;

if (apiKey) {
  aiClient = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// In-memory store for comic history / user comics
const comicDatabase: any[] = [];

// Sample image paths generated
const FALLBACK_PANEL_IMAGES = [
  '/src/assets/images/comic_fox_forest_1790603509624.jpg',
  '/src/assets/images/comic_cyber_city_1790603530459.jpg',
  '/src/assets/images/comic_space_alien_1790603546468.jpg',
  '/src/assets/images/comic_hero_splash_1790603495610.jpg',
];

// Helper to select an appropriate image based on setting and prompt
function selectBestImage(setting: string, prompt: string, panelIndex: number): string {
  const lower = `${setting} ${prompt}`.toLowerCase();
  if (lower.includes('forest') || lower.includes('tree') || lower.includes('fox') || lower.includes('woods') || lower.includes('nature')) {
    return FALLBACK_PANEL_IMAGES[0];
  }
  if (lower.includes('cyber') || lower.includes('city') || lower.includes('neon') || lower.includes('night') || lower.includes('street')) {
    return FALLBACK_PANEL_IMAGES[1];
  }
  if (lower.includes('space') || lower.includes('alien') || lower.includes('planet') || lower.includes('star') || lower.includes('astro')) {
    return FALLBACK_PANEL_IMAGES[2];
  }
  return FALLBACK_PANEL_IMAGES[panelIndex % FALLBACK_PANEL_IMAGES.length];
}

// 1. Generate Comic Storyline & 5 Panels Route
app.post('/api/generate-comic', async (req: Request, res: Response) => {
  try {
    const { prompt, characterName = 'Hero', setting = 'Enchanted Forest', tone = 'Dramatic', artStyle = 'Comic Book' } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required.' });
    }

    let generatedComicData: any = null;

    if (aiClient) {
      try {
        const systemPrompt = `You are a master comic book writer and visual artist at a legendary publishing house (Marvel, DC, Dark Horse).
Your job is to take the user's idea and generate a complete, coherent 5-panel comic strip narrative.
The comic must feature:
- Main Character: ${characterName}
- Setting: ${setting}
- Tone: ${tone}
- Art Style: ${artStyle}

Return a valid JSON object matching the requested schema with exactly 5 panels.
Each panel must have:
- panel: integer from 1 to 5
- title: concise punchy panel title (e.g. "Panel 1: The Whispering Tree")
- scene_description: short setting & atmosphere description in 1-2 sentences
- caption: ambient narration or environment sound description
- narration: character action, internal thought, or plot progression
- sound_effect: dynamic comic onomatopoeia (e.g. "WHOOSH!", "BAM!", "CRACKLE!", "SKRRRT!")
- dialogues: array of dialogues with "speaker", "text", "type" (choose 'speech', 'shout', 'whisper', 'thought')
- camera: cinematic camera angle (e.g. "Wide Establishing Shot", "Extreme Close-Up", "Low Angle Heroic", "High Dutch Angle")
- image_prompt: rich, vivid, descriptive visual prompt for generating the illustration in ${artStyle} style, specifying lighting, composition, colors, and subject details.`;

        const response = await aiClient.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: `Story Idea: ${prompt}\nHero: ${characterName}\nSetting: ${setting}\nTone: ${tone}\nArt Style: ${artStyle}`,
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: 'Catchy comic title' },
                issue: { type: Type.STRING, description: 'Issue tag, e.g. "Issue #1: Origin"' },
                tagline: { type: Type.STRING, description: 'Exciting teaser tagline' },
                synopsis: { type: Type.STRING, description: '2-sentence comic synopsis' },
                panels: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      panel: { type: Type.INTEGER },
                      title: { type: Type.STRING },
                      scene_description: { type: Type.STRING },
                      caption: { type: Type.STRING },
                      narration: { type: Type.STRING },
                      sound_effect: { type: Type.STRING },
                      camera: { type: Type.STRING },
                      image_prompt: { type: Type.STRING },
                      dialogues: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            speaker: { type: Type.STRING },
                            text: { type: Type.STRING },
                            type: { type: Type.STRING },
                          },
                          required: ['speaker', 'text', 'type'],
                        },
                      },
                    },
                    required: ['panel', 'title', 'scene_description', 'caption', 'narration', 'image_prompt'],
                  },
                },
              },
              required: ['title', 'issue', 'tagline', 'synopsis', 'panels'],
            },
          },
        });

        const rawText = response.text || '';
        generatedComicData = JSON.parse(rawText);
      } catch (aiErr) {
        console.error('Gemini generation error, using fallback creator:', aiErr);
      }
    }

    // Fallback if no key or API error
    if (!generatedComicData || !generatedComicData.panels || generatedComicData.panels.length === 0) {
      generatedComicData = {
        title: `${characterName}: Tales of ${setting}`,
        issue: 'Issue #1: The Awakening',
        tagline: `When darkness falls upon ${setting}, only ${characterName} dares to stand.`,
        synopsis: `A thrilling tale of courage and discovery as ${characterName} ventures into the unknown depths of ${setting}, confronting secrets whispered by the stars.`,
        panels: [
          {
            panel: 1,
            title: `Panel 1: The Threshold of ${setting}`,
            scene_description: `${characterName} stands at the outer perimeter of ${setting}, watching the horizon shift with uncanny energy.`,
            caption: `Whispers carried upon the twilight wind, carrying ancient portents of destiny.`,
            narration: `${characterName}, known across the realm for unwavering tenacity, surveyed the boundary with keen, observant senses.`,
            sound_effect: 'RUMBLE...',
            camera: 'Cinematic Wide Establishing Shot',
            image_prompt: `A dynamic comic book illustration of ${characterName} gazing toward a breathtaking vista of ${setting}, dramatic golden hour lighting, bold ink outlines, halftone texturing.`,
            dialogues: [
              { speaker: characterName, text: "The ancient maps were true... It's really here.", type: 'thought' }
            ]
          },
          {
            panel: 2,
            title: `Panel 2: First Footsteps`,
            scene_description: `Venturing deeper into the heart of ${setting}, strange luminous glyphs begin to illuminate around their path.`,
            caption: `Every step echoed with the weight of centuries asleep.`,
            narration: `Caution battled with curiosity, but the beacon ahead offered no turning back.`,
            sound_effect: 'CRACKLE!',
            camera: 'Low Angle Tracking Shot',
            image_prompt: `Comic panel showing ${characterName} stepping cautiously through glowing flora and arcane machinery, vibrant emerald and violet rim light, dynamic comic lines.`,
            dialogues: [
              { speaker: characterName, text: "Stay sharp. We are not alone.", type: 'whisper' },
              { speaker: 'Companion', text: "Are you sure this is safe?!", type: 'speech' }
            ]
          },
          {
            panel: 3,
            title: `Panel 3: The Guardian Awakens`,
            scene_description: `A colossal spectral mechanism stirs from the core of ${setting}, eyes blazing with cosmic intensity.`,
            caption: `The silence shattered like brittle glass.`,
            narration: `With a roar that shook the earth, the sentinel of the forgotten sanctum demanded tribute.`,
            sound_effect: 'KABOOM!',
            camera: 'Dramatic Dutch Angle Hero Shot',
            image_prompt: `Dramatic superhero comic showdown between ${characterName} and a gigantic sentinel creature with celestial energy, speed lines, comic speech bubble sparks.`,
            dialogues: [
              { speaker: 'Guardian', text: "WHO DISTURBS THE SANCTUARY OF THE AEONS?!", type: 'shout' },
              { speaker: characterName, text: "Someone who won't back down!", type: 'speech' }
            ]
          },
          {
            panel: 4,
            title: `Panel 4: The Strike of Will`,
            scene_description: `${characterName} leaps through the air with acrobatic precision, channeling inner power to redirect the blast.`,
            caption: `In a fraction of a heartbeat, instinct took over fear.`,
            narration: `Energy collided in a dazzling corona of light, repelling the titan's grasp.`,
            sound_effect: 'BZZZZZT!',
            camera: 'Extreme Dynamic Action Close-Up',
            image_prompt: `High-voltage comic action clash, ${characterName} dodging an energy beam in mid-air, stylized comic impact starburst, vivid saturated palette.`,
            dialogues: [
              { speaker: characterName, text: "Not today, titan!", type: 'shout' }
            ]
          },
          {
            panel: 5,
            title: `Panel 5: The Dawn of a Legend`,
            scene_description: `The guardian retreats into the mist, leaving behind a glowing relic. The path forward is finally unlocked.`,
            caption: `The trial was won, but the greater journey was merely beginning.`,
            narration: `Holding the sacred relic high, ${characterName} looked toward the dawn with a renewed spirit.`,
            sound_effect: 'SHIIING!',
            camera: 'Triumphant Heroic Low Angle',
            image_prompt: `Heroic triumphant comic panel with ${characterName} holding a glowing cosmic relic, sunlight piercing through clouds, epic graphic novel style.`,
            dialogues: [
              { speaker: characterName, text: "Phase one complete. Now the real adventure starts!", type: 'speech' }
            ]
          }
        ]
      };
    }

    // Attach imagery and IDs to each panel
    const enrichedPanels = generatedComicData.panels.map((p: any, idx: number) => {
      const selectedImg = selectBestImage(setting, prompt, idx);
      return {
        ...p,
        panel: p.panel || idx + 1,
        image_url: selectedImg,
        dialogues: (p.dialogues || []).map((d: any, dIdx: number) => ({
          id: `dlg-${idx}-${dIdx}-${Date.now()}`,
          speaker: d.speaker || characterName,
          text: d.text || '...',
          type: d.type || 'speech',
          position: { x: 15 + (dIdx * 30), y: 15 + (dIdx * 25) }
        }))
      };
    });

    const fullComicStory = {
      id: `comic-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      title: generatedComicData.title || `${characterName}'s Journey`,
      issue: generatedComicData.issue || 'Issue #1',
      tagline: generatedComicData.tagline || 'An epic saga generated with Gemini',
      synopsis: generatedComicData.synopsis || prompt,
      character_name: characterName,
      setting: setting,
      tone: tone,
      art_style: artStyle,
      panels: enrichedPanels,
      cover_image: selectBestImage(setting, prompt, 0),
      created_at: new Date().toISOString(),
    };

    comicDatabase.unshift(fullComicStory);

    return res.json({
      success: true,
      comic: fullComicStory,
    });
  } catch (error: any) {
    console.error('Error generating comic:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate comic' });
  }
});

// 2. Real-Time Creative AI Assistant / Support Route
app.post('/api/live-assist', async (req: Request, res: Response) => {
  try {
    const { message, currentComic, contextType = 'general' } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required.' });
    }

    if (aiClient) {
      const systemPrompt = `You are "ComicCraft Copilot", an elite real-time comic consultant and script doctor.
You assist writers and artists live in their workspace.
Keep responses concise, inspiring, comic-literate, with practical punchy dialogue snippets, sound effects, or plot twists.
Current comic context: Title: "${currentComic?.title || 'Untitled'}", Hero: "${currentComic?.character_name || 'Hero'}", Setting: "${currentComic?.setting || 'Unknown'}", Tone: "${currentComic?.tone || 'Classic'}".
Provide actionable suggestions directly usable in panels.`;

      const response = await aiClient.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: message,
        config: {
          systemInstruction: systemPrompt,
        },
      });

      return res.json({
        reply: response.text || 'Here is an idea for your comic panel: make the dialogue punchier with an unexpected punchline!',
      });
    }

    // Fallback response if no key
    const cannedReplies = [
      `Try adding a punchy onomatopoeia like "THWIP!" or "KRAKATOA!" to make Panel 3 burst off the page!`,
      `For ${currentComic?.character_name || 'your hero'}, consider a dramatic one-liner before the climax: "You picked the wrong forest to haunt."`,
      `In comic pacing, Panel 4 works best as an extreme close-up on the hero's eyes to build tension before the splash page finish!`,
      `Consider switching the speech bubble style to "Angular Shouting" for the villain's entrance!`,
    ];
    const randomReply = cannedReplies[Math.floor(Math.random() * cannedReplies.length)];
    return res.json({ reply: randomReply });
  } catch (error: any) {
    console.error('Error in live-assist:', error);
    return res.status(500).json({ error: error.message || 'Support error' });
  }
});

// 3. Regenerate / Refine a Specific Panel
app.post('/api/regenerate-panel', async (req: Request, res: Response) => {
  try {
    const { panelIndex, instruction, currentComic } = req.body;
    const currentPanel = currentComic?.panels?.[panelIndex];

    if (!currentPanel) {
      return res.status(400).json({ error: 'Panel not found' });
    }

    if (aiClient) {
      const prompt = `Refine this single comic panel based on the user instruction: "${instruction || 'Make it more dramatic'}".
Current Panel ${panelIndex + 1}:
Title: ${currentPanel.title}
Scene: ${currentPanel.scene_description}
Narration: ${currentPanel.narration}
Art Style: ${currentComic.art_style}

Return a JSON with:
- title
- scene_description
- caption
- narration
- sound_effect
- dialogues: array of { speaker, text, type }
- image_prompt`;

      const response = await aiClient.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      const updatedPanel = {
        ...currentPanel,
        ...parsed,
        panel: panelIndex + 1,
        image_url: currentPanel.image_url,
      };

      return res.json({ success: true, panel: updatedPanel });
    }

    // Fallback refinement
    const updatedPanel = {
      ...currentPanel,
      title: `${currentPanel.title} (Overcharged)`,
      scene_description: `${currentPanel.scene_description} - with intensified dynamic atmospheric effects and heightened energy.`,
      narration: `The stakes escalated instantly as the winds howled with fury!`,
      sound_effect: 'THOOOOM!',
    };

    return res.json({ success: true, panel: updatedPanel });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to refine panel' });
  }
});

// 4. Regenerate Image for a Specific Panel using Gemini
app.post('/api/regenerate-panel-image', async (req: Request, res: Response) => {
  try {
    const { panelIndex = 0, prompt, artStyle = 'Comic Book', currentImage } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    let newImageUrl: string | null = null;

    if (aiClient) {
      try {
        const imageResponse = await aiClient.models.generateContent({
          model: 'gemini-3.1-flash-lite-image',
          contents: {
            parts: [
              {
                text: `Comic book panel illustration: ${prompt}. Artistic style: ${artStyle}. Masterful comic art, dynamic composition, dramatic lighting.`
              }
            ]
          },
          config: {
            imageConfig: {
              aspectRatio: '4:3'
            }
          }
        });

        if (imageResponse.candidates?.[0]?.content?.parts) {
          for (const part of imageResponse.candidates[0].content.parts) {
            if (part.inlineData?.data) {
              const mime = part.inlineData.mimeType || 'image/png';
              newImageUrl = `data:${mime};base64,${part.inlineData.data}`;
              break;
            }
          }
        }
      } catch (imgErr) {
        console.warn('Gemini image generation attempt notice:', imgErr);
      }
    }

    if (!newImageUrl) {
      // Pick another high-fidelity panel image from pool
      const available = FALLBACK_PANEL_IMAGES.filter(img => img !== currentImage);
      newImageUrl = available.length > 0
        ? available[Math.floor(Math.random() * available.length)]
        : FALLBACK_PANEL_IMAGES[(panelIndex + 1) % FALLBACK_PANEL_IMAGES.length];
    }

    return res.json({
      success: true,
      imageUrl: newImageUrl,
      refinedPrompt: prompt
    });
  } catch (err: any) {
    console.error('Error regenerating panel image:', err);
    return res.status(500).json({ error: err.message || 'Image generation failed' });
  }
});

// 5. Get Comic Library & History
app.get('/api/comics', (req: Request, res: Response) => {
  return res.json({ comics: comicDatabase });
});

// Start Vite server and Express
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ComicCraft Studio running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start ComicCraft server:', err);
});
