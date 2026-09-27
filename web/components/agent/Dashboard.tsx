"use client";

import { SceneDeck, type SceneDeckState } from "@/components/scenes";
import type { Answer } from "@/lib/agentApi";
import type { Dataset } from "@/lib/types";
import type { SponsorLive } from "./Sponsors";
import { AnswerScene } from "./scenes/AnswerScene";
import { CareersScene } from "./scenes/CareersScene";
import { DrillScene } from "./scenes/DrillScene";
import type { CareersState, DeckScene, Journey, TwinFacts } from "./scenes/model";
import { ReceiptScene } from "./scenes/ReceiptScene";
import type { ReceiptState } from "./scenes/useJourney";
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
  fixTerms: () => void;
}

/** The scene deck: exactly one hero visualisation on screen, each written from the loaded student's real data. */
export function Dashboard({ deck, j, tw, ds, live, careers, receipt, answers, answerIndex, overrides, actions }: { deck: SceneDeckState; j: Journey; tw: TwinFacts | null; ds: Dataset | null; live: SponsorLive; careers: CareersState; receipt: ReceiptState; answers: Answer[]; answerIndex: number; overrides: { drill?: Answer; repair?: Answer }; actions: DeckActions }) {
  const next = () => void deck.next();

  const scene = (id: DeckScene) => {
    switch (id) {
      case "risk":
        return <RiskScene j={j} live={live} canHear={actions.canHear} onHear={actions.hear} onAsk={actions.ask} onNext={next} />;
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
      case "receipt":
        return <ReceiptScene j={j} receipt={receipt} onFix={actions.fixTerms} onNext={next} />;
      case "answer":
        return <AnswerScene answers={answers} index={answerIndex} onSelect={actions.selectAnswer} j={j} ds={ds} live={live} onAsk={actions.ask} onGo={actions.go} onAskAbout={actions.askAbout} />;
    }
  };

  return (
    <SceneDeck
      deck={deck}
      render={(id) => <div className="h-full">{scene(id as DeckScene)}</div>}
    />
  );
}
