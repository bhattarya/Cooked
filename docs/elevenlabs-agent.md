# ElevenLabs live agent setup

The cohort explorer at `/app/explore` can run a real ElevenLabs voice conversation. The existing `/voice` clip endpoint remains available for narrated answers in the audit workspace.

1. Create a **private** ElevenLabs Agent in the [ElevenLabs Agents dashboard](https://elevenlabs.io/app/conversational-ai) and enable authentication in its Security tab.
2. Add a **Client** tool named exactly `exploreCohort`. Give it one required **string** parameter named `question`. Enable **Wait for response**. A short tool description is: “For every question about student pathways, course load, work, internships, outcomes, majors, or cost, call this tool with the student's full question. Read the returned cohort result before answering. The tool also updates the chart.”
   Add a second **Client** tool named exactly `askStudent`, also with one required string parameter named `question` and **Wait for response** enabled. Its description is: “When the user has uploaded a degree audit and asks about their own risk, course prerequisites, what-if scenario, stress test, or repair, call this tool with their full question. It computes the answer and updates the personal chart.”
3. Use this agent instruction:

   > You are COOKED, a conversational guide to the synthetic HackUMBC 2026 Career Pathways & Degree ROI dataset. For every data question, call a tool first and wait for its response. Use `exploreCohort` for cohort patterns and `askStudent` for a student who has uploaded an audit. Speak only to values, sample sizes, and caveats returned by the tool; read a personal tool answer exactly. Never invent student records, grades, employment outcomes, or causal claims. Say that No Response means unknown. Money is nominal by year. If a user wants a personal prediction before uploading an audit, invite them to upload one in the app. Keep replies brief and natural.

4. Set `ELEVENLABS_AGENT_ID` and `ELEVENLABS_API_KEY` in the **web runtime**. The key needs permission to request a conversational signed URL. Locally, the shared root `.env` is read by Next.js. In DigitalOcean, fill the web component's encrypted secret fields.
5. Sign in, open `/app/explore`, and select **Start live ElevenLabs agent**. The browser requests `/voice-session` with the existing session cookie, then connects with the short-lived signed WebSocket URL. The API key never reaches the browser.

The `exploreCohort` client tool calls COOKED's fixed `/explore` route. Gemini routes the question to one of six predefined aggregate queries; Tiger Data computes the numbers, and the chart displays them. The `askStudent` client tool uses the existing `/students/{id}/ask` orchestration and updates the audit workspace. No arbitrary SQL from the model runs against the database.
