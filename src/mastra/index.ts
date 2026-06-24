import { Mastra } from "@mastra/core/mastra";
import { Effect } from "effect";
import { WeatherWorkflowService } from "./workflows/weather-workflow";
import { WeatherAgentService } from "./agents/weather-agent";
import { WeatherScorerService } from "./scorers/weather-scorer";

class MastraService extends Effect.Service<MastraService>()(
  "app/MastraService",
  {
    dependencies: [
      WeatherAgentService.Default,
      WeatherWorkflowService.Default,
      WeatherScorerService.Default,
    ],
    effect: Effect.gen(function* () {
      const { weatherAgent } = yield* WeatherAgentService;
      const { weatherWorkflow } = yield* WeatherWorkflowService;
      const {
        toolCallAppropriatenessScorer,
        completenessScorer,
        translationScorer,
      } = yield* WeatherScorerService;

      const mastra = new Mastra({
        workflows: { weatherWorkflow },
        agents: { weatherAgent },
        scorers: {
          toolCallAppropriatenessScorer,
          completenessScorer,
          translationScorer,
        },
      });

      return {
        mastra,
      };
    }),
  },
) {}

export const mastra = Effect.runSync(
  Effect.gen(function* () {
    const service = yield* MastraService;
    return service.mastra;
  }).pipe(Effect.provide(MastraService.Default)),
);
