import type { EditorId } from "../../api/types";
import antigravity from "../../assets/editors/antigravity.png";
import cursor from "../../assets/editors/cursor.png";
import kiro from "../../assets/editors/kiro.png";
import code from "../../assets/editors/vscode.png";
import windsurf from "../../assets/editors/windsurf.png";

const LOGOS: Record<EditorId, string> = {
  code,
  cursor,
  antigravity,
  kiro,
  windsurf,
};

export function IdeIcon({ id, size = 24 }: { id: EditorId; size?: number }) {
  return (
    <img
      src={LOGOS[id]}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className="block shrink-0"
    />
  );
}
