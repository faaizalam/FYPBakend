import express from "express";
import { body, validationResult } from "express-validator";
import nodemailer from "nodemailer";
import { GoogleGenerativeAI } from "@google/generative-ai";
import cors from "cors";
import { config } from "dotenv";
import crypto from "crypto";
config();
import service from "./service.json" with { type: "json" };
import admin from "firebase-admin";

admin.initializeApp({
  credential: admin.credential.cert(service),
});
const db = admin.firestore();
const app = express();
app.use(express.json());
app.use(cors());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post(
  "/generate-report",
  [
    body("currentInterviewId")
      .notEmpty()
      .withMessage("Interview ID is required"),
    body("emotions").notEmpty().withMessage("Emotions are required"),
    body("confidenceLevel")
      .notEmpty()
      .withMessage("Confidence level is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentInterviewId, emotions, confidenceLevel,average } = req.body;
 
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const prompt = `
Generate a consistent, clean, professional HTML report for an interview using the following data:
Interview ID: ${currentInterviewId}
Confidence Level: ${confidenceLevel}%
Emotions: ${JSON.stringify(emotions, null, 2)}
Before And After Report :${average}

Structure:
1. Title: "Interview Report"
2. Section: Interview ID
3. Table: Emotion and count
4. Section: Confidence Level
5. Section: Before And After Report
6. Section: Assessment (Overall rating: Fine, Satisfactory, Good, Excellent)
7. Section: Reasoning
8. Section: Further Considerations

Use clean HTML and inline CSS. Match this structure and design:

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Interview Report</title>
</head>
<body style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px;">
  <div style="max-width: 700px; margin: auto; background: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1);">
    <h2 style="text-align: center; color: #333333;">Interview Report</h2>
    <p><strong>Interview ID:</strong> ${currentInterviewId}</p>
    
    <h3 style="color: #333;">Emotions Detected</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="background-color: #000; color: white;">
          <th style="padding: 10px; border: 1px solid #ccc;">Emotion</th>
          <th style="padding: 10px; border: 1px solid #ccc;">Count</th>
        </tr>
      </thead>
      <tbody>
        <!-- Fill this dynamically using the emotion data -->
      </tbody>
    </table>

    <h3 style="color: #333;">Confidence Level</h3>
    <p>${confidenceLevel}%</p>
    <h3 style="color: #333;">Before And After Report</h3>
    <p>${average}%</p>

    <h3 style="color: #333;">Assessment</h3>
    <p><strong>Overall Rating:</strong> (AI decides from emotions + confidence)</p>

    <h3 style="color: #333;">Reasoning</h3>
    <p>[Explain why the rating was given based on confidence and emotions]</p>

    <h3 style="color: #333;">Further Considerations</h3>
    <p>[Any concerns or follow-ups]</p>

    <div style="text-align: center; margin-top: 30px;">
      <a href="http://localhost:3000/hr/Interviews" style="padding: 12px 25px; background: #000; color: white; text-decoration: none; border-radius: 5px;">Review Briefing</a>
    </div>

    <p style="text-align: center; color: #aaa; margin-top: 40px;">Powered by Final Year Project</p>
  </div>
</body>
</html>

Return the HTML only, no code blocks, no triple backticks, no markdown, no extra explanation.
`;

      const result = await model.generateContent(prompt);
      const report = result.response.text();

      await db.collection("reports").doc(currentInterviewId).set({
        interviewId: currentInterviewId,
        reportHtml: report,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      const uniqueSuffix = `${Date.now()}-${crypto
        .randomBytes(4)
        .toString("hex")}`;
      const messageId = `<${uniqueSuffix}@faaizalam>`;
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_HR,
        subject: "AI-Generated Interview Report",
        html: report,
        headers: {
          "Message-ID": messageId,
          References: `<no-reference-${uniqueSuffix}@enterflow.co>`,
          "In-Reply-To": `<no-reply-${uniqueSuffix}@enterflow.co>`,
          "X-No-Thread": "true",
        },
      });

      res.status(200).json({
        message: "Report generated and emailed to HR.",
        report,
      });
    } catch (error) {
      console.error("Generation error:", error);
      res.status(500).json({ error: "Failed to generate report." });
    }
  }
);

app.listen(4000, () => {
  console.log("✅ Server is running on port 4000");
});
