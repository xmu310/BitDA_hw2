export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { data } = req.body;
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            throw new Error('API key configuration missing on server');
        }

        const prompt = `You are a quantitative analyst. Review this 7-day MSTR/BTC ratio data:\n${data}\nProvide a concise, professional 3-sentence summary on whether the premium is expanding or contracting, and what it implies for institutional sentiment.`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts:[{ text: prompt }] }]
            })
        });

        if (!response.ok) {
            throw new Error('Failed to fetch from Gemini API');
        }

        const result = await response.json();
        const textText = result.candidates[0].content.parts[0].text;
        
        return res.status(200).json({ summary: textText });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error.message });
    }
}