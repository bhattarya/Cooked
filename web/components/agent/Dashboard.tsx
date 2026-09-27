"use client";

import { SceneDeck, type SceneDeckState } from "@/components/scenes";
import type { Answer } from "@/lib/agentApi";
import type { Dataset } from "@/lib/types";
import type { SponsorLive } from "./Sponsors";
import { AnswerScene } from "./scenes/AnswerScene";
import { CareersScene } from "./scenes/CareersScene";
import { DrillScene } from "./scenes/DrillScene";
import type { CareersState, DeckScene, Journey, TwinFacts } from "./scenes/model";
import { RepairScene } from "./scenes/RepairScene";
import { RiskScene } from "./scenes/RiskScene";
import { TimelineScene } from "./scenes/TimelineScene";
import { TwinsScene } from "./scenes/TwinsScene";

export type { FullState } from "./scenes/model";

export interface DeckActions {
  ask: () => void;
  askAbout: (question: string) => void;
  hear: () => void;
  canHear: boolean;
  go: (scene: DeckScene) => void;
  selectAnswer: (i: number) => void;
}

/** The scene deck: exactly one hero visualisation on screen, each written from the loaded student's real data. */
export function Dashboard({ deck, j, tw, ds, live, careers, answers, answerIndex, overrides, actions }: { deck: SceneDeckState; j: Journey; tw: TwinFacts | null; ds: Dataset | null; live: SponsorLive; careers: CareersState; answers: Answer[]; answerIndex: number; overrides: { drill?: Answer; repair?: Answer }; actions: DeckActions }) {
  const next = () => void deck.next();

  const scene = (id: DeckScene) => {
    switch (id) {
      case "risk":
        return <RiskScene j={j} live={live} canHear={actions.canHear} onHear={actions.hear} onAsk={actions.ask} onAskAbout={actions.askAbout} onNext={next} />;
      case "timeline":
        return <TimelineScene j={j} tw={tw} live={live} onNext={next} />;
      case "twins":
        return <TwinsScene j={j} tw={tw} ds={ds} live={live} onNext={next} />;
      case "drill":
        return j.drill ? <DrillScene d={j.drill} answer={overrides.drill} live={live} onNext={next} /> : null;
      case "repair":
        return j.repair ? <RepairScene j={j} r={j.repair} answer={overrides.repair} live={live} onNext={next} onAskAbout={actions.askAbout} /> : null;
      case "careers":
        return <CareersScene state={careers} live={live} onNext={() => actions.go("answer")} />;
      case "answer":
        return <AnswerScene answers={answers} index={answerIndex} onSelect={actions.selectAnswer} j={j} ds={ds} live={live} onAsk={actions.ask} onGo={actions.go} onAskAbout={actions.askAbout} />;
    }
  };

  return (
    <SceneDeck
      deck={deck}
      // the deck reserves room for its left rail with padding that its absolutely-positioned scenes ignore, so each scene keeps clear of the rail itself
      render={(id) => <div className="h-full w-full">{scene(id as DeckScene)}</div>}
    />
  );
}
