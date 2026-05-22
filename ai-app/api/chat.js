const BASE_SYSTEM = `Du bist ein hochpräziser KI-Assistent mit Internetzugang über Google Search.
- Antworte präzise und direkt — kein Fülltext
- Sprache: Deutsch außer der Nutzer schreibt anders
- Formatiere Antworten mit Markdown (** fett, - Listen)`;

const IMAGE_SYSTEM = `Du bist ein Bild-Analyse-Assistent.
1. Beschreibe das Bild detailliert: Merkmale, Kleidung, Logos, Texte, Orte, Objekte
2. Nenne was du erkennst und wo man mehr dazu finden könnte
3. Gib konkrete Suchbegriffe an die der Nutzer googeln kann

Format:
**Bildbeschreibung:**
[Detaillierte Beschreibung]

**Erkannte Elemente:**
- [Element 1]
- [Element 2]

**Empfohlene Suchbegriffe:**
- "[Suchbegriff 1]"
- "[Suchbegriff 2]"`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const { mode, messages, content } = req.body;

  try {
    // Build Gemini contents array
    let contents = [];
    let systemInstruction = mode === 'image' ? IMAGE_SYSTEM : BASE_SYSTEM;

    if (mode === 'image') {
      // Image mode — find image and text parts
      const imgPart = content.find(c => c.type === 'image');
      const txtPart = content.find(c => c.type === 'text');
      contents = [{
        role: 'user',
        parts: [
          { inline_data: { mime_type: imgPart.source.media_type, data: imgPart.source.data } },
          { text: txtPart?.text || 'Analysiere dieses Bild detailliert.' }
        ]
      }];
    } else {
      // Text mode — convert history
      contents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents,
          tools: mode === 'image' ? undefined : [{ google_search: {} }],
          generationConfig: { maxOutputTokens: 1500, temperature: 0.7 }
        }),
      }
    );

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const reply = data.candidates?.[0]?.content?.parts
      ?.filter(p => p.text)
      ?.map(p => p.text)
      ?.join('') || 'Keine Antwort erhalten.';

    res.json({ reply });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
