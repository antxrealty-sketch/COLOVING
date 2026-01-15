const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

// Simple health check
app.get('/', (req, res) => {
  res.send('Perplexity Sonar API is running');
});

// Main endpoint that calls Perplexity Sonar
app.post('/api/sonar', async (req, res) => {
  try {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'PERPLEXITY_API_KEY is not set' });
    }

    const userMessage = req.body.message || 'Say hello from Sonar.';

    const body = {
      model: 'sonar',
      messages: [
        { role: 'user', content: userMessage }
      ]
    };

    const response = await axios.post(
      'https://api.perplexity.ai/chat/completions',
      body,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const content = response.data?.choices?.[0]?.message?.content || '';
    res.json({ reply: content });

  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ error: 'Error calling Perplexity Sonar' });
  }
});

// ARV underwriting endpoint - builds a prompt from subject + comps and returns a Sonar-generated report
app.post('/api/arv-underwrite', async (req, res) => {
  try {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'PERPLEXITY_API_KEY is not set' });

    const { subject, sales_data } = req.body || {};
    if (!subject || !sales_data) return res.status(400).json({ error: 'subject and sales_data required in body' });

    // Limit comps sent to keep prompt size reasonable
    const comps = Array.isArray(sales_data) ? sales_data.slice(0, 200) : [];

    const prompt = `You are an expert residential real estate underwriter. Given the subject property and comparable sales below, produce a concise underwriting memo containing:\n- Estimated ARV (single dollar value) and a short rationale\n- Key adjustments/comparable notes (3-6 bullets)\n- A short list of the top 5 comps used and why\n- Confidence level (low/medium/high) and any assumptions or data gaps.\n\nRespond in plain text.\n\nSubject:\n${JSON.stringify(subject, null, 2)}\n\nComps (first ${comps.length}):\n${JSON.stringify(comps, null, 2)}`;

    const body = {
      model: 'sonar',
      messages: [
        { role: 'user', content: prompt }
      ]
    };

    const response = await axios.post('https://api.perplexity.ai/chat/completions', body, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const content = response.data?.choices?.[0]?.message?.content || '';
    res.json({ report: content });
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ error: 'Error calling Perplexity Sonar for ARV underwrite' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
