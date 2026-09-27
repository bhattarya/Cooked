import { sceneInfo, type SceneId } from "@/lib/commands";

/**
 * Voice `showScene` for a scene that lives on another route: navigate there and answer in one short sentence.
 * The journey scenes live on /app (the `scene` query is a hint the audit workspace may use to open the right one).
 */
export function routeToScene(scene: SceneId, push: (href: string) => void): string {
  if (scene === "advisor") { push("/app/advisor"); return "Opening the advisor overview."; }
  if (scene === "audit") { push("/app"); return "Opening your audit workspace."; }
  const label = sceneInfo(scene)?.label ?? scene;
  if (scene === "explore") {
    push("/app/explore");
    return "Opening the cohort explorer.";
  }
  if (scene === "models") {
    push("/app/lab");
    return `Opening the ${label}, where the four models compete.`;
  }
  push(`/app?scene=${scene}`);
  return `Opening the audit workspace for the ${label} scene. Your loaded audit stays with this conversation.`;
}
