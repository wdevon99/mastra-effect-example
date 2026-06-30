import { createToolCallAccuracyScorerCode } from "@mastra/evals/scorers/prebuilt";
import { createCompletenessScorer } from "@mastra/evals/scorers/prebuilt";
import {
  getAssistantMessageFromRunOutput,
  getUserMessageFromRunInput,
} from "@mastra/evals/scorers/utils";
import { createScorer } from "@mastra/core/evals";
import { Effect, JSONSchema, Schema } from "effect";

export class WeatherScorerService extends Effect.Service<WeatherScorerService>()(
  "app/WeatherScorerService",
  {
    effect: Effect.gen(function* () {
      const toolCallAppropriatenessScorer = createToolCallAccuracyScorerCode({
        expectedTool: "weatherTool",
        strictMode: false,
      });

      const completenessScorer = createCompletenessScorer();

      // Custom LLM-judged scorer: evaluates if non-English locations are translated appropriately
      const translationScorer = createScorer({
        id: "translation-quality-scorer",
        name: "Translation Quality",
        description:
          "Checks that non-English location names are translated and used correctly",
        type: "agent",
        judge: {
          model: "openai/gpt-5-mini",
          instructions:
            "You are an expert evaluator of translation quality for geographic locations. " +
            "Determine whether the user text mentions a non-English location and whether the assistant correctly uses an English translation of that location. " +
            "Be lenient with transliteration differences and diacritics. " +
            "Return only the structured JSON matching the provided schema.",
        },
      })
        .preprocess(({ run }) => {
          const userText = getUserMessageFromRunInput(run.input) || "";
          const assistantText = getAssistantMessageFromRunOutput(run.output) || "";
          return { userText, assistantText };
        })
        .analyze({
          description:
            "Extract location names and detect language/translation adequacy",
          outputSchema: JSONSchema.make(
            Schema.Struct({
              nonEnglish: Schema.Boolean,
              translated: Schema.Boolean,
              confidence: Schema.Number,
              explanation: Schema.String,
            }),
          ),
          createPrompt: ({ results }) => `
            You are evaluating if a weather assistant correctly handled translation of a non-English location.
            User text:
            """
            ${results.preprocessStepResult.userText}
            """
            Assistant response:
            """
            ${results.preprocessStepResult.assistantText}
            """
            Tasks:
            1) Identify if the user mentioned a location that appears non-English.
            2) If non-English, check whether the assistant used a correct English translation of that location in its response.
            3) Be lenient with transliteration differences (e.g., accents/diacritics).
            Return JSON with fields:
            {
            "nonEnglish": boolean,
            "translated": boolean,
            "confidence": number, // 0-1
            "explanation": string
            }
        `,
        })
        .generateScore(({ results }) => {
          const r = (results as any)?.analyzeStepResult || {};
          if (!r.nonEnglish) return 1; // If not applicable, full credit
          if (r.translated)
            return Math.max(0, Math.min(1, 0.7 + 0.3 * (r.confidence ?? 1)));
          return 0; // Non-English but not translated
        })
        .generateReason(({ results, score }) => {
          const r = (results as any)?.analyzeStepResult || {};
          return `Translation scoring: nonEnglish=${r.nonEnglish ?? false}, translated=${r.translated ?? false}, confidence=${r.confidence ?? 0}. Score=${score}. ${r.explanation ?? ""}`;
        });

      return {
        toolCallAppropriatenessScorer,
        completenessScorer,
        translationScorer,
      };
    }),
  },
) {}
